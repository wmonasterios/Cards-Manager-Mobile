import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ParsedTx = { date: string; merchant: string; amount: number; plan?: string | null; plan_rate?: string | null };
type ParsedFields = {
  bank: string; product?: string | null; network?: string | null; last4?: string | null;
  currency?: string; balance: number; credit_limit?: number | null; minimum_payment: number;
  cutoff_date: string; due_date: string; full_payment_due_date?: string | null;
  full_payment_amount?: number | null; transactions: ParsedTx[];
};

function dedupKey(tx: ParsedTx) {
  return `${tx.date}|${tx.merchant.trim().toLowerCase()}|${tx.amount.toFixed(2)}`;
}

// The same statement read twice (uploaded once, forwarded by email later)
// doesn't always come back with identical merchant text: casing, accents and
// truncation vary between reads ("Grand Deli Gourmet OBA Panamá" vs "GRAND
// DELI GOURMET OBA PANAM"), so dedupKey alone let those through as new rows.
// Compare on a normalized name instead: no accents, letters/digits only, and
// a shared prefix is enough (statements truncate long names).
function normMerchant(m: string) {
  return m.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function sameMerchant(a: string, b: string) {
  const x = normMerchant(a);
  const y = normMerchant(b);
  if (!x || !y) return x === y;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
  const n = Math.min(x.length, y.length, 12);
  return n >= 8 && x.slice(0, n) === y.slice(0, n);
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string, isEs: boolean) {
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return iso;
  return isEs ? `${d} ${MONTHS_ES[m - 1]}` : `${MONTHS_EN[m - 1]} ${d}`;
}

// The same statement arriving twice (uploaded, then forwarded; or forwarded
// twice) is caught before anything is saved: the new copy and its PDF are
// removed and the user is told it was already there, instead of piling up a
// second history entry for the same cutoff.
async function notifyDuplicate(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  bank: string,
  cutoff: string,
) {
  try {
    const { data: profile } = await supabase.from("profiles").select("push_token, lang").eq("id", userId).single();
    const pushToken = profile?.push_token as string | undefined;
    if (!pushToken) return;
    const isEs = profile?.lang === "es";
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        to: pushToken,
        title: isEs ? "Ya lo tenías" : "Already saved",
        body: isEs
          ? `${bank}: el estado de cuenta con corte ${shortDate(cutoff, true)} ya estaba cargado. No agregamos nada.`
          : `${bank}: the statement with cutoff ${shortDate(cutoff, false)} was already saved. Nothing was added.`,
      }),
    });
  } catch {
    // Best-effort.
  }
}

// Saving used to run silently for 60-70+ seconds on a statement with many new
// merchants (each classified one at a time, waiting on Claude sequentially) —
// long enough that whoever's waiting deserves a nudge when it's actually done.
async function notifyApplied(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  bank: string,
  txCount: number,
  // Set when a re-read replaced the statement's lines: what actually changed.
  replaced?: { added: number; removed: number },
) {
  try {
    const { data: profile } = await supabase.from("profiles").select("push_token, lang").eq("id", userId).single();
    const pushToken = profile?.push_token as string | undefined;
    if (!pushToken) return;
    const isEs = profile?.lang === "es";
    const title = isEs ? "Estado de cuenta guardado" : "Statement saved";
    // 0 inserted doesn't mean the parse/save failed — it means every
    // transaction on this statement was already saved (a duplicate email,
    // a resend, the same PDF uploaded twice). Say that plainly instead of
    // "updated with 0 transactions," which reads as something went wrong.
    let replacedBody: string | null = null;
    if (replaced) {
      const { added, removed } = replaced;
      const parts = isEs
        ? [
          added > 0 ? `${added} ${added === 1 ? "transacción nueva" : "transacciones nuevas"}` : "",
          removed > 0 ? `${removed} ${removed === 1 ? "quitada" : "quitadas"}` : "",
        ]
        : [
          added > 0 ? `${added} new transaction${added === 1 ? "" : "s"}` : "",
          removed > 0 ? `${removed} removed` : "",
        ];
      const changes = parts.filter(Boolean).join(", ");
      replacedBody = isEs
        ? changes ? `${bank}: nueva lectura guardada — ${changes}.` : `${bank}: nueva lectura guardada, sin cambios en las transacciones.`
        : changes ? `${bank}: new reading saved — ${changes}.` : `${bank}: new reading saved, no changes to the transactions.`;
    }
    const body = replacedBody ?? (txCount === 0
      ? (isEs ? `${bank} ya estaba al día — nada nuevo que agregar.` : `${bank} was already up to date — nothing new to add.`)
      : isEs
        ? `${bank} actualizado con ${txCount} ${txCount === 1 ? "transacción" : "transacciones"}.`
        : `${bank} updated with ${txCount} transaction${txCount === 1 ? "" : "s"}.`);
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ to: pushToken, title, body }),
    });
  } catch {
    // Push delivery is best-effort — never fail the request over a notification.
  }
}

const CATEGORY_IDS = [
  "dining", "groceries", "transport", "fuel", "shopping", "home", "beauty",
  "pharmacy", "health", "entertainment", "subscriptions", "kids", "education",
  "travel", "hotels", "insurance", "utilities", "government", "housing", "fees", "payment",
  "transfer", "cash", "topup", "taxes", "other",
];

const CLASSIFY_TOOL = {
  name: "classify_merchant",
  description: "Assign exactly one spending category to a merchant name from a Latin American credit card statement.",
  input_schema: {
    type: "object",
    properties: {
      category_id: { type: "string", enum: CATEGORY_IDS },
      confidence: { type: "number", description: "0 to 1" },
    },
    required: ["category_id", "confidence"],
  },
};

const CLASSIFY_SYSTEM_PROMPT = `You classify merchant names from credit card statements used in Latin America (mostly Panama) into spending categories. Pick exactly one category_id from the tool's enum.

Category meanings:
- dining: restaurants, cafes, bars, food delivery
- groceries: supermarkets, minimarkets, grocery stores
- transport: taxis, rideshare (Uber/Cabify), tolls, parking — fuel is NOT here
- fuel: gas stations
- shopping: online marketplaces / general e-commerce, department stores, clothing, footwear, fashion accessories
- home: home goods, hardware stores
- beauty: salons, spas, barbershops
- pharmacy: pharmacies, medicine
- health: doctors, labs, clinics (not pharmacies)
- entertainment: cinemas, events, tickets, entertainment streaming, sports or social club memberships
- subscriptions: software and recurring services (not entertainment streaming)
- kids: schools, daycare, kids' activities
- education: courses, university, personal education
- travel: flights, travel agencies
- hotels: lodging
- insurance: insurance policies
- utilities: telecom, utilities, professional services
- government: government paperwork, notaries
- housing: rent, mortgage, home maintenance
- fees: bank fees, financing/installment charges
- payment: payments made to the credit card itself
- transfer: transfers between accounts
- cash: cash withdrawals
- topup: prepaid balance top-ups
- taxes: tax payments
- other: use only if genuinely nothing else fits

Rules learned from a real categorization history:
- Cinemas and anything ticket-related for entertainment go in "entertainment", never "other".
- Any kind of restaurant, fast food, or cafe goes in "dining", even under a generic bank label.
- Financing/installment charges and bank charges go in "fees".
- Use "other" only as a last resort. If the name suggests a recognizable brand or chain, use general knowledge to assign a reasonable category even without full certainty.`;

async function classifyWithClaude(merchantRaw: string): Promise<{ category: string; confidence: number } | null> {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 128,
        system: CLASSIFY_SYSTEM_PROMPT,
        tools: [CLASSIFY_TOOL],
        tool_choice: { type: "tool", name: "classify_merchant" },
        messages: [{ role: "user", content: `Merchant: "${merchantRaw}"` }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const toolUse = json.content?.find((b: any) => b.type === "tool_use");
    if (!toolUse) return null;
    const { category_id, confidence } = toolUse.input as { category_id: string; confidence: number };
    if (!CATEGORY_IDS.includes(category_id)) return null;
    return { category: category_id, confidence: typeof confidence === "number" ? confidence : 0.5 };
  } catch {
    return null;
  }
}

// Resolution order per merchant: personal override -> global dictionary -> a suggestion
// already pending from an earlier statement (any user) -> a fresh Claude classification,
// saved as a new pending suggestion.
async function classifyMerchant(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  merchantRaw: string,
): Promise<{ category: string; source: string }> {
  const { data: resolved } = await supabase
    .rpc("resolve_merchant_category_detailed", { p_user_id: userId, p_merchant_raw: merchantRaw })
    .maybeSingle();
  if (resolved?.category_id) {
    return { category: resolved.category_id as string, source: resolved.source as string };
  }

  const { data: pending } = await supabase
    .rpc("get_pending_suggestion", { p_merchant_raw: merchantRaw });
  if (pending) {
    return { category: pending as string, source: "suggestion" };
  }

  const claudeResult = await classifyWithClaude(merchantRaw);
  const category = claudeResult?.category ?? "other";
  const confidence = claudeResult?.confidence ?? 0.3;
  await supabase.rpc("upsert_merchant_suggestion", {
    p_merchant_raw: merchantRaw,
    p_category_id: category,
    p_confianza: confidence,
  });
  return { category, source: "suggestion" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const { statementId, fields, cardId: requestedCardId, replace } = (await req.json()) as {
      statementId: string;
      fields: ParsedFields;
      cardId?: string;
      // "Volver a leer": this statement was already applied and has just been
      // re-read; its old rows are swapped for the new reading.
      replace?: boolean;
    };
    if (!statementId || !fields) {
      return new Response(JSON.stringify({ error: "statementId and fields are required" }), { status: 400, headers: corsHeaders });
    }

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: corsHeaders });
    }

    const { data: statement, error: stmtErr } = await supabase
      .from("statements")
      .select("*")
      .eq("id", statementId)
      .single();
    if (stmtErr || !statement) {
      return new Response(JSON.stringify({ error: "Statement not found" }), { status: 404, headers: corsHeaders });
    }

    const last4 = (fields.last4 ?? "").replace(/\D/g, "").slice(-4) || null;
    const bankText = fields.bank.trim().toLowerCase();

    // Which card this belongs to is resolved by the client, not guessed here:
    // either it's explicit (uploaded from inside a specific card, or picked
    // during review), or it's an exact match against a previously-confirmed
    // (bank, last4) combination — never a fuzzy live-text guess, since bank
    // names can be printed differently statement to statement and last4
    // changes whenever a card gets renewed.
    let existing: any = null;
    if (requestedCardId) {
      const { data } = await supabase
        .from("cards")
        .select("*")
        .eq("id", requestedCardId)
        .eq("user_id", user.id)
        .single();
      existing = data ?? null;
      if (!existing) {
        return new Response(JSON.stringify({ error: "Card not found" }), { status: 404, headers: corsHeaders });
      }
    } else {
      const { data: aliasHit } = await supabase
        .from("card_aliases")
        .select("card_id")
        .eq("user_id", user.id)
        .eq("bank_text", bankText)
        .eq("last4", last4)
        .maybeSingle();
      if (aliasHit) {
        const { data } = await supabase
          .from("cards")
          .select("*")
          .eq("id", aliasHit.card_id)
          .eq("user_id", user.id)
          .single();
        existing = data ?? null;
      }
    }

    let cardId: string;
    let created = false;

    if (existing) {
      cardId = existing.id;
      const isNewer =
        !existing.cutoff_date ||
        (fields.cutoff_date && fields.cutoff_date > existing.cutoff_date) ||
        (!!replace && fields.cutoff_date === existing.cutoff_date);
      if (isNewer) {
        await supabase.from("cards").update({
          product: fields.product ?? existing.product,
          network: fields.network ?? existing.network,
          last4: last4 ?? existing.last4,
          currency: fields.currency ?? existing.currency,
          balance: fields.balance,
          credit_limit: fields.credit_limit ?? existing.credit_limit,
          minimum_payment: fields.minimum_payment,
          cutoff_date: fields.cutoff_date,
          due_date: fields.due_date,
          full_payment_due_date: fields.full_payment_due_date ?? null,
          full_payment_amount: fields.full_payment_amount ?? null,
          paid_this_cycle: false,
        }).eq("id", existing.id);

        // The statement's own balance is authoritative and already nets out
        // anything paid on or before its cutoff — a manually-registered
        // payment for that same money would otherwise double up (subtracted
        // again from a balance that already reflects it) every time a newer
        // statement rolls in. Clearing it here, not just at display time,
        // means nothing else that ever reads the payments table can
        // double-count it either.
        await supabase
          .from("payments")
          .delete()
          .eq("card_id", existing.id)
          .lte("paid_on", fields.cutoff_date);
      }
    } else {
      const { data: newCard, error: createErr } = await supabase
        .from("cards")
        .insert({
          user_id: user.id,
          bank: fields.bank,
          product: fields.product ?? null,
          network: fields.network ?? null,
          last4,
          currency: fields.currency ?? "USD",
          balance: fields.balance,
          credit_limit: fields.credit_limit ?? 0,
          minimum_payment: fields.minimum_payment,
          cutoff_date: fields.cutoff_date,
          due_date: fields.due_date,
          full_payment_due_date: fields.full_payment_due_date ?? null,
          full_payment_amount: fields.full_payment_amount ?? null,
        })
        .select("*")
        .single();
      if (createErr || !newCard) throw new Error(createErr?.message ?? "Could not create card");
      cardId = newCard.id;
      created = true;
    }

    if (!created && fields.cutoff_date) {
      const { data: dupRows } = await supabase
        .from("statements")
        .select("id")
        .eq("card_id", cardId)
        .eq("status", "applied")
        .eq("parsed->>cutoff_date", fields.cutoff_date)
        .neq("id", statementId)
        .limit(1);
      if (dupRows && dupRows.length > 0) {
        if (statement.storage_path) await supabase.storage.from("statements").remove([statement.storage_path]);
        await supabase.from("statements").delete().eq("id", statementId);
        await notifyDuplicate(supabase, user.id, fields.bank, fields.cutoff_date);
        return new Response(
          JSON.stringify({ cardId, created: false, transactionsInserted: 0, duplicate: true, cutoffDate: fields.cutoff_date }),
          { headers: { ...corsHeaders, "content-type": "application/json" } },
        );
      }
    }

    // Learn this (bank, last4) combination for next time, whichever card it
    // landed on — this is what lets a renewed card (new last4, same bank)
    // keep matching automatically after the first time someone confirms it.
    await supabase.from("card_aliases").upsert(
      { user_id: user.id, card_id: cardId, bank_text: bankText, last4 },
      { onConflict: "card_id,bank_text,last4", ignoreDuplicates: true },
    );

    // Re-reading an applied statement: take its old rows out first (so the
    // dedup below doesn't match the new reading against the old one), but
    // remember what the user changed by hand on them to carry it over.
    type Kept = { date: string; merchant: string; amount: string; category: string | null; excluded: boolean };
    const kept: Kept[] = [];
    let previousLines: { date: string; merchant: string; amount: string }[] | null = null;
    if (replace && !created) {
      const { data: oldRows } = await supabase
        .from("transactions")
        .select("occurred_on, merchant, amount, category, category_source, excluded_from_spend")
        .eq("statement_id", statementId);
      previousLines = ((oldRows ?? []) as any[]).map((t) => ({
        date: t.occurred_on,
        merchant: t.merchant,
        amount: Number(t.amount).toFixed(2),
      }));
      for (const t of (oldRows ?? []) as any[]) {
        if (t.category_source === "manual" || t.excluded_from_spend) {
          kept.push({
            date: t.occurred_on,
            merchant: t.merchant,
            amount: Number(t.amount).toFixed(2),
            category: t.category_source === "manual" ? t.category : null,
            excluded: !!t.excluded_from_spend,
          });
        }
      }
      const { error: delErr } = await supabase.from("transactions").delete().eq("statement_id", statementId);
      if (delErr) throw new Error(delErr.message);
    }

    // Drop lines this card already has (same date and amount, merchant equal
    // once normalized) before classifying or inserting anything. Each existing
    // row can absorb only one incoming line, so two genuinely identical
    // charges on the same day still both land the first time.
    // The reader sometimes lists the statement's opening balance ("Saldo
    // Anterior") as if it were a charge. It isn't one — counting it once
    // added US$ 8,230.95 of fake spending to a ConnectMiles month.
    const NOT_A_TRANSACTION = /^\s*(saldo\s+(anterior|inicial|previo)|balance\s+(anterior|forward)|previous\s+balance)\b/i;
    let incoming = (fields.transactions ?? []).filter((tx) => !NOT_A_TRANSACTION.test(tx.merchant ?? ""));
    if (!created && incoming.length > 0) {
      const dates = incoming.map((tx) => tx.date).filter(Boolean).sort();
      const { data: already } = await supabase
        .from("transactions")
        .select("occurred_on, merchant, amount")
        .eq("card_id", cardId)
        .gte("occurred_on", dates[0])
        .lte("occurred_on", dates[dates.length - 1])
        .limit(5000);
      const pool = (already ?? []).map((t: any) => ({ date: t.occurred_on as string, merchant: t.merchant as string, amount: Number(t.amount).toFixed(2) }));
      incoming = incoming.filter((tx) => {
        const i = pool.findIndex((p) => p.date === tx.date && p.amount === Number(tx.amount).toFixed(2) && sameMerchant(p.merchant, tx.merchant));
        if (i === -1) return true;
        pool.splice(i, 1);
        return false;
      });
    }

    // Classify each distinct merchant once, in parallel, instead of once per
    // transaction in sequence — five Uber trips on one statement used to mean
    // five separate back-to-back Claude calls for the same merchant.
    const uniqueMerchants = Array.from(new Set(incoming.map((tx) => tx.merchant)));
    const classifications = new Map<string, { category: string; source: string }>();
    await Promise.all(
      uniqueMerchants.map(async (merchant) => {
        classifications.set(merchant, await classifyMerchant(supabase, user.id, merchant));
      }),
    );

    // Two identical lines on one statement (same day, merchant and amount —
    // two small Uber rides, a fee charged on two sub-accounts) are two real
    // charges: the statement's totals only reconcile with both. The base
    // dedupKey would collapse them into one, so repeats get "#2", "#3"…
    const seen = new Map<string, number>();
    const txRows = incoming.map((tx) => {
      const { category, source } = classifications.get(tx.merchant)!;
      const base = dedupKey(tx);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return {
        user_id: user.id,
        card_id: cardId,
        statement_id: statementId,
        occurred_on: tx.date,
        merchant: tx.merchant,
        amount: tx.amount,
        category,
        category_source: source,
        dedup_key: n === 1 ? base : `${base}#${n}`,
        plan: tx.plan ?? null,
        plan_rate: tx.plan_rate ?? null,
      };
    });

    let inserted = 0;
    if (txRows.length > 0) {
      const { data: insertedRows, error: txErr } = await supabase
        .from("transactions")
        .upsert(txRows, { onConflict: "card_id,dedup_key", ignoreDuplicates: true })
        .select("id, occurred_on, merchant, amount");
      if (txErr) throw new Error(txErr.message);
      inserted = insertedRows?.length ?? 0;
      for (const k of kept) {
        const hit = (insertedRows ?? []).find(
          (t: any) => t.occurred_on === k.date && Number(t.amount).toFixed(2) === k.amount && sameMerchant(t.merchant, k.merchant),
        );
        if (!hit) continue;
        const patch: Record<string, unknown> = {};
        if (k.category) {
          patch.category = k.category;
          patch.category_source = "manual";
        }
        if (k.excluded) patch.excluded_from_spend = true;
        await supabase.from("transactions").update(patch).eq("id", (hit as any).id);
      }
    }

    await supabase
      .from("statements")
      .update({ card_id: cardId, status: "applied", applied_at: new Date().toISOString(), parsed: fields })
      .eq("id", statementId);

    // A re-read deletes and re-inserts every line, so "inserted" is the whole
    // statement; tell the user what actually changed against the old rows.
    let replaced: { added: number; removed: number } | undefined;
    if (previousLines) {
      const pool = [...previousLines];
      let added = 0;
      for (const r of txRows) {
        const i = pool.findIndex(
          (p) => p.date === r.occurred_on && p.amount === Number(r.amount).toFixed(2) && sameMerchant(p.merchant, r.merchant),
        );
        if (i === -1) added++;
        else pool.splice(i, 1);
      }
      replaced = { added, removed: pool.length };
    }

    await notifyApplied(supabase, user.id, fields.bank, inserted, replaced);

    return new Response(JSON.stringify({ cardId, created, transactionsInserted: inserted, ...(replaced ?? {}) }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
