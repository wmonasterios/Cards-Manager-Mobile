// submit-report: saves a "Reportar un error" from the app and emails it to
// support@poquetapp.com, so a misread bank (like Colpatria, Oct 2026) reaches
// the owner with everything needed to look into it.
//
// Called from Settings → "Reportar un error", the statement review screen and
// the statement detail. Deployed with verify_jwt = true; the user is taken
// from their own access token. Writes with the service role (the app can't
// insert into support_reports directly). Mail goes out through the same
// Mailgun domain receive-statement-email already sends from
// (stmts.poquetapp.com) — no DNS change; Reply-To is the user, so answering
// the email answers them.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = "stmts.poquetapp.com";
const SUPPORT_TO = "support@poquetapp.com";
const MAX_PER_DAY = 10;

const AREAS = ["parsing", "balances", "instalments", "reminders", "other"] as const;
const SOURCES = ["settings", "review", "statement"] as const;
const AREA_LABEL: Record<string, string> = {
  parsing: "Lectura del PDF",
  balances: "Saldos",
  instalments: "Cuotas",
  reminders: "Recordatorios",
  other: "Otro",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : null) || null;
const isUuid = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const area = AREAS.includes(body.area as never) ? (body.area as string) : "other";
  const source = SOURCES.includes(body.source as never) ? (body.source as string) : "settings";
  const message = str(body.message, 4000);
  if (!message) return json({ error: "empty_message" }, 400);
  const allowReview = body.allowReview === true;
  const device = (body.device ?? {}) as Record<string, unknown>;

  // A simple brake against a stuck button or abuse.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin
    .from("support_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_DAY) return json({ error: "too_many" }, 429);

  // The statement is only linked when the user allowed a review. A given id
  // must be theirs; without one, "my last statement" = their newest.
  type Stmt = {
    id: string;
    bank: string | null;
    status: string | null;
    source: string | null;
    received_at: string | null;
    storage_path: string | null;
    parsed: Record<string, unknown> | null;
  };
  let stmt: Stmt | null = null;
  if (allowReview) {
    const q = admin
      .from("statements")
      .select("id, bank, status, source, received_at, storage_path, parsed")
      .eq("user_id", user.id);
    const { data } = isUuid(body.statementId)
      ? await q.eq("id", body.statementId as string).maybeSingle()
      : await q.order("received_at", { ascending: false }).limit(1).maybeSingle();
    stmt = (data as Stmt | null) ?? null;
  }

  const { data: row, error: insErr } = await admin
    .from("support_reports")
    .insert({
      user_id: user.id,
      area,
      message,
      statement_id: stmt?.id ?? null,
      allow_review: allowReview,
      source,
      app_version: str(device.appVersion, 40),
      update_id: str(device.updateId, 60),
      platform: str(device.platform, 20),
      os_version: str(device.osVersion, 40),
      lang: str(device.lang, 10),
    })
    .select("id, created_at")
    .single();
  if (insErr || !row) {
    console.error("insert failed", insErr);
    return json({ error: "save_failed" }, 500);
  }

  // Email the owner. A failed email never fails the report: it's saved.
  let emailed = false;
  if (MAILGUN_API_KEY) {
    const p = stmt?.parsed ?? {};
    const stmtLine = stmt
      ? [
          `${(p.bank as string) ?? stmt.bank ?? "Banco ?"} ·· ${(p.last4 as string) ?? "????"}`,
          `corte ${(p.cutoff_date as string) ?? "?"}`,
          `${(p.currency as string) ?? ""}`.trim(),
          `estado: ${stmt.status ?? "?"}`,
          `llegó por: ${stmt.source ?? "?"}`,
          stmt.storage_path ? "PDF disponible" : "PDF ya borrado (90 días)",
          `ID ${stmt.id}`,
        ]
          .filter(Boolean)
          .join(" · ")
      : allowReview
        ? "Permitió revisar, pero no tiene estados de cuenta."
        : "No permitió revisar sus estados de cuenta.";
    const deviceLine = [
      `App ${str(device.appVersion, 40) ?? "?"}`,
      str(device.updateLabel, 60),
      str(device.platform, 20),
      str(device.osVersion, 40),
      str(device.lang, 10),
    ]
      .filter(Boolean)
      .join(" · ");
    const where = { settings: "Ajustes", review: "Revisión del estado de cuenta", statement: "Detalle del estado de cuenta" }[source];

    const text = [
      `Reporte · ${AREA_LABEL[area]} (desde ${where})`,
      "",
      message,
      "",
      `Usuario: ${user.email ?? user.id} (responder a este correo le contesta)`,
      `Estado de cuenta: ${stmtLine}`,
      `Dispositivo: ${deviceLine}`,
      `Reporte ${row.id} · ${row.created_at}`,
    ].join("\n");
    const html = `<p><b>Reporte · ${escapeHtml(AREA_LABEL[area])}</b> (desde ${escapeHtml(where)})</p>
<blockquote style="border-left:3px solid #ccc;margin:0;padding:4px 12px;white-space:pre-wrap">${escapeHtml(message)}</blockquote>
<p>Usuario: ${escapeHtml(user.email ?? user.id)} <i>(responder a este correo le contesta)</i><br>
Estado de cuenta: ${escapeHtml(stmtLine)}<br>
Dispositivo: ${escapeHtml(deviceLine)}<br>
<span style="color:#888">Reporte ${row.id} · ${row.created_at}</span></p>`;

    const form = new FormData();
    form.append("from", `Poquet <no-responder@${MAILGUN_DOMAIN}>`);
    form.append("to", SUPPORT_TO);
    if (user.email) form.append("h:Reply-To", user.email);
    const subjectBank = stmt ? ` · ${(stmt.parsed?.bank as string) ?? stmt.bank ?? ""}` : "";
    form.append("subject", `Reporte: ${AREA_LABEL[area]}${subjectBank}`.trim());
    form.append("text", text);
    form.append("html", html);
    try {
      const r = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: form,
      });
      emailed = r.ok;
      if (!r.ok) console.error("mailgun", r.status, await r.text());
    } catch (e) {
      console.error("mailgun error", e);
    }
    if (emailed) await admin.from("support_reports").update({ emailed: true }).eq("id", row.id);
  }

  return json({ ok: true, id: row.id, emailed });
});
