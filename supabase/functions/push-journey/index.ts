// push-journey: server-sent nudges for the new-user journey plus monthly
// due-day / after-cutoff reminders (Oct 2026). Copy approved by the owner.
//
// Called hourly by pg_cron through private.invoke_push_journey (see
// migration 20261018_push_journey.sql). verify_jwt = false; requires the
// `x-cron-secret` header (checked by the service-role-only RPC
// `check_cron_secret`), same as purge-old-statement-pdfs.
//
// Rules: one push per user per ~day (20 h), at most 3 per 7 days, only
// 09:00–20:00 Panama, never amounts in the text (lock screen). Every send is
// logged in public.push_log, unique per (user, kind, ref), so each journey
// step goes out once and monthly ones once per card + date. The log id rides
// in the push data; the app reports taps through mark_push_opened(), which
// fills push_log.opened_at (tap rate per message).
//
// Body (optional JSON): { "dryRun": true } returns what would be sent;
// { "onlyUser": "<uuid>" } limits the run to one account (testing);
// { "ignoreHours": true } skips the 09–20 window (testing only).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Lang = "es" | "en";
type Kind =
  | "due_today"
  | "after_cutoff"
  | "welcome"
  | "no_statement_1"
  | "no_statement_3"
  | "advisor"
  | "forwarding"
  | "second_card"
  | "habit";

const DAY = 24 * 60 * 60 * 1000;
const TZ = "America/Panama";

const COPY: Record<Kind, Record<Lang, { title: string; body: string }>> = {
  welcome: {
    es: { title: "Bienvenido a Poquet 👋", body: "Sube o reenvía tu primer estado de cuenta y en un minuto lo tienes ordenado." },
    en: { title: "Welcome to Poquet 👋", body: "Upload or forward your first statement and it's sorted in a minute." },
  },
  no_statement_1: {
    es: { title: "¿Dónde está tu PDF?", body: "En la app o el correo de tu banco, busca «Estados de cuenta». Lo demás es nuestro." },
    en: { title: "Where's your PDF?", body: "Check your bank's app or email for \"Statements\". We'll take it from there." },
  },
  no_statement_3: {
    es: { title: "Sin claves, sin vueltas", body: "No pedimos claves bancarias y el PDF se borra a los 90 días. Súbelo tranquilo." },
    en: { title: "No passwords, no fuss", body: "We never ask for bank passwords, and the PDF is deleted after 90 days." },
  },
  forwarding: {
    es: { title: "Que llegue solo cada mes 📩", body: "Reenvía tus estados desde Gmail una vez y no vuelves a subir nada." },
    en: { title: "Let it arrive on its own 📩", body: "Set up forwarding from Gmail once and never upload again." },
  },
  second_card: {
    es: { title: "¿Tienes otra tarjeta? 💳", body: "Súmala y mira todo lo que debes en un solo lugar." },
    en: { title: "Got another card? 💳", body: "Add it and see everything you owe in one place." },
  },
  advisor: {
    es: { title: "Pregúntale a tu Asesor 💬", body: "«¿Qué tarjeta pago primero?» Te responde con tus propios números." },
    en: { title: "Ask your Advisor 💬", body: "\"Which card should I pay first?\" It answers with your own numbers." },
  },
  due_today: {
    es: { title: "Hoy vence tu {card}", body: "Mejor saberlo hoy. Toca para ver el detalle." },
    en: { title: "Your {card} is due today", body: "Better to know today. Tap to see the details." },
  },
  after_cutoff: {
    es: { title: "Tu estado de {card} ya salió", body: "Súbelo o reenvíalo para mantener todo al día." },
    en: { title: "Your {card} statement is out", body: "Upload or forward it to keep everything up to date." },
  },
  habit: {
    es: { title: "Dos meses al día 🎉", body: "Listo. Una cosa menos en tu cabeza." },
    en: { title: "Two months on track 🎉", body: "Done. One less thing on your mind." },
  },
};

// Where a tap should land in the app (see NotificationsSync, type 'journey').
const SCREEN: Record<Kind, "statements" | "card" | "advisor" | "home"> = {
  welcome: "statements",
  no_statement_1: "statements",
  no_statement_3: "statements",
  forwarding: "statements",
  second_card: "statements",
  advisor: "advisor",
  due_today: "card",
  after_cutoff: "statements",
  habit: "home",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// YYYY-MM-DD in Panama time.
function panamaDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function panamaHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(d));
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function allRows<T>(q: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const provided = req.headers.get("x-cron-secret") ?? "";
  const { data: ok, error: authErr } = provided
    ? await admin.rpc("check_cron_secret", { p_secret: provided })
    : { data: false, error: null };
  if (authErr || ok !== true) return json({ error: "unauthorized" }, 401);

  let dryRun = false, onlyUser: string | null = null, ignoreHours = false;
  try {
    const b = await req.json();
    dryRun = b?.dryRun === true;
    onlyUser = typeof b?.onlyUser === "string" ? b.onlyUser : null;
    ignoreHours = b?.ignoreHours === true;
  } catch { /* no body */ }

  const now = new Date();
  const hour = panamaHour(now);
  if (!ignoreHours && (hour < 9 || hour >= 20)) return json({ skipped: "outside_hours", hour });
  const today = panamaDate(now);

  // Everyone who can receive a push. Review accounts are left out.
  let pq = admin.from("profiles")
    .select("id, created_at, push_token, lang, push_reminders, push_updates, plan_source")
    .not("push_token", "is", null);
  if (onlyUser) pq = pq.eq("id", onlyUser);
  const { data: profiles, error: pErr } = await pq;
  if (pErr) return json({ error: pErr.message }, 500);
  const people = (profiles ?? []).filter((p) => p.plan_source !== "review");
  if (!people.length) return json({ candidates: 0, sent: 0 });
  const ids = people.map((p) => p.id);

  const cards = await allRows<any>(() =>
    admin.from("cards").select("id, user_id, bank, nickname, cutoff_date, due_date, paid_this_cycle, archived")
      .in("user_id", ids).eq("archived", false).order("id"));
  const stmts = await allRows<any>(() =>
    admin.from("statements").select("id, user_id, card_id, source, status, received_at, applied_at")
      .in("user_id", ids).eq("status", "applied").order("id"));
  const asked = await allRows<any>(() =>
    admin.from("advisor_messages").select("user_id").in("user_id", ids).eq("role", "user").order("id"));
  const log = await allRows<any>(() =>
    admin.from("push_log").select("user_id, kind, ref, sent_at").in("user_id", ids).order("id"));

  const askedSet = new Set(asked.map((a) => a.user_id));
  const plan: { userId: string; token: string; kind: Kind; ref: string; title: string; body: string; cardId?: string }[] = [];

  for (const p of people) {
    const mine = log.filter((l) => l.user_id === p.id);
    const sentKeys = new Set(mine.map((l) => `${l.kind}|${l.ref}`));
    const lastDay = mine.some((l) => now.getTime() - new Date(l.sent_at).getTime() < 20 * 60 * 60 * 1000);
    const lastWeek = mine.filter((l) => now.getTime() - new Date(l.sent_at).getTime() < 7 * DAY).length;
    if (lastDay || lastWeek >= 3) continue;

    const lang: Lang = p.lang === "es" ? "es" : "en";
    const myCards = cards.filter((c) => c.user_id === p.id);
    const myStmts = stmts.filter((s) => s.user_id === p.id);
    const age = now.getTime() - new Date(p.created_at).getTime();
    const firstApplied = myStmts.map((s) => new Date(s.applied_at ?? s.received_at).getTime()).sort((a, b) => a - b)[0];
    const sinceFirst = firstApplied ? now.getTime() - firstApplied : null;
    const label = (c: any) => (c.nickname || c.bank || "").trim() || (lang === "es" ? "tarjeta" : "card");

    const options: { kind: Kind; ref: string; cardId?: string; card?: string }[] = [];

    // Monthly reminders first (highest priority).
    if (p.push_reminders) {
      for (const c of myCards) {
        if (c.due_date === today && !c.paid_this_cycle) {
          options.push({ kind: "due_today", ref: `${c.id}:${c.due_date}`, cardId: c.id, card: label(c) });
        }
      }
      for (const c of myCards) {
        if (!c.cutoff_date) continue;
        const due = addDays(c.cutoff_date, 4);
        const stale = addDays(c.cutoff_date, 20);
        const hasNew = myStmts.some((s) => s.card_id === c.id && panamaDate(new Date(s.received_at)) > c.cutoff_date);
        if (today >= due && today <= stale && !hasNew) {
          options.push({ kind: "after_cutoff", ref: `${c.id}:${c.cutoff_date}`, cardId: c.id, card: label(c) });
        }
      }
    }

    // Journey steps, in order; each one only inside its window so older
    // accounts aren't flooded when this starts.
    if (p.push_updates) {
      if (age < 2 * DAY) options.push({ kind: "welcome", ref: "" });
      if (!myStmts.length && age >= 1 * DAY && age < 3 * DAY) options.push({ kind: "no_statement_1", ref: "" });
      if (!myStmts.length && age >= 3 * DAY && age < 7 * DAY) options.push({ kind: "no_statement_3", ref: "" });
      if (sinceFirst !== null && sinceFirst >= 1 * DAY && sinceFirst < 14 * DAY && !askedSet.has(p.id)) {
        options.push({ kind: "advisor", ref: "" });
      }
      if (sinceFirst !== null && sinceFirst >= 2 * DAY && sinceFirst < 14 * DAY && !myStmts.some((s) => s.source === "email")) {
        options.push({ kind: "forwarding", ref: "" });
      }
      if (myStmts.length && myCards.length === 1 && age >= 5 * DAY && age < 21 * DAY) {
        options.push({ kind: "second_card", ref: "" });
      }
      // Habit: a card got a statement in a later cycle (20+ days after its
      // first one — people often backfill several old statements on day
      // one, which isn't a habit), and that happened in the last 7 days.
      for (const c of myCards) {
        const forCard = myStmts.filter((s) => s.card_id === c.id)
          .map((s) => new Date(s.received_at).getTime()).sort((a, b) => a - b);
        const next = forCard.find((t) => t - forCard[0] >= 20 * DAY);
        if (next !== undefined && now.getTime() - next < 7 * DAY) {
          options.push({ kind: "habit", ref: "" });
          break;
        }
      }
    }

    const pick = options.find((o) => !sentKeys.has(`${o.kind}|${o.ref}`));
    if (!pick) continue;
    const c = COPY[pick.kind][lang];
    const fill = (s: string) => s.replace("{card}", pick.card ?? "");
    plan.push({ userId: p.id, token: p.push_token, kind: pick.kind, ref: pick.ref, title: fill(c.title), body: fill(c.body), cardId: pick.cardId });
  }

  if (dryRun) {
    return json({ dryRun: true, today, hour, candidates: plan.map(({ token: _t, ...rest }) => rest) });
  }

  let sent = 0;
  const errors: string[] = [];
  for (let i = 0; i < plan.length; i += 100) {
    const batch = plan.slice(i, i + 100);
    // Log first so the row id can travel in the push (tap tracking).
    const { data: rows, error: logErr } = await admin.from("push_log").insert(batch.map((m) => ({
      user_id: m.userId, kind: m.kind, ref: m.ref, title: m.title, body: m.body, status: "pending",
    }))).select("id, user_id, kind, ref");
    if (logErr || !rows) { errors.push(logErr?.message ?? "log insert failed"); continue; }
    const idOf = (m: typeof batch[number]) =>
      rows.find((r) => r.user_id === m.userId && r.kind === m.kind && r.ref === m.ref)?.id;
    let tickets: any[] = [];
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch.map((m) => ({
          to: m.token,
          title: m.title,
          body: m.body,
          sound: "default",
          data: { type: "journey", kind: m.kind, screen: SCREEN[m.kind], cardId: m.cardId, logId: idOf(m) },
        }))),
      });
      tickets = (await res.json())?.data ?? [];
    } catch (e) {
      errors.push(String(e));
    }
    for (let j = 0; j < batch.length; j++) {
      const m = batch[j];
      const t = tickets[j];
      const okSend = t?.status === "ok";
      if (okSend) sent++;
      await admin.from("push_log").update({
        status: okSend ? "sent" : "error", error: okSend ? null : (t?.message ?? "no ticket"),
      }).eq("id", idOf(m));
      // Stale token: stop trying that device.
      if (t?.details?.error === "DeviceNotRegistered") {
        await admin.from("profiles").update({ push_token: null }).eq("id", m.userId).eq("push_token", m.token);
      }
    }
  }
  return json({ today, hour, candidates: plan.length, sent, errors });
});
