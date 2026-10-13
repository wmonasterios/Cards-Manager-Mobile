import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTRACT_TOOL = {
  name: "extract_statement",
  description: "Extract structured data from a credit card statement PDF.",
  input_schema: {
    type: "object",
    properties: {
      bank: { type: "string", description: "The bank or issuer name as printed on the statement." },
      product: { type: "string", description: "Card product name, e.g. 'Visa Infinite'." },
      network: { type: "string", description: "Card network, e.g. Visa, Mastercard." },
      last4: { type: "string", description: "Last 4 digits of the card number." },
      currency: { type: "string", description: "ISO currency code, e.g. USD." },
      balance: { type: "number", description: "Current/statement balance owed." },
      previous_balance: { type: "number", description: "Previous balance carried over from the last statement (\"Saldo anterior\"), as printed. Never also list it as a transaction." },
      credit_limit: { type: "number", description: "Total credit limit of the card." },
      minimum_payment: { type: "number", description: "Minimum payment due this cycle." },
      cutoff_date: { type: "string", description: "Statement cutoff/closing date, ISO yyyy-mm-dd." },
      due_date: { type: "string", description: "Payment due date, ISO yyyy-mm-dd." },
      full_payment_due_date: { type: "string", description: "Full payment due date if different from due_date, ISO yyyy-mm-dd." },
      full_payment_amount: { type: "number", description: "Amount for paying the statement in full." },
      transactions: {
        type: "array",
        description: "Every transaction line on the statement, from every sub-account/detail section combined, in the order they appear.",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "Transaction date, ISO yyyy-mm-dd. Assume the statement's year if not printed." },
            merchant: { type: "string" },
            amount: { type: "number", description: "Negative for charges/purchases, positive for payments or credits." },
            plan: { type: "string", description: "If this line is an instalment/cuotas purchase, the progress exactly as printed, e.g. '4/12' or '4 de 12'. Omit entirely for a regular one-time charge." },
            plan_rate: { type: "string", description: "The interest rate for this instalment plan if printed on the same line, e.g. '1.2% mensual' or '0%'. Omit if not printed." },
          },
          required: ["date", "merchant", "amount"],
        },
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      notes: { type: "string", description: "Anything you were unsure about or could not read." },
    },
    required: ["bank", "currency", "balance", "minimum_payment", "cutoff_date", "due_date", "transactions", "confidence"],
  },
};

const EXTRACT_PROMPT_TEXT =
  "This is a credit card statement, possibly in Spanish, from a bank in Panama. Extract every field and every transaction line using the extract_statement tool. Some statements combine multiple card sub-accounts on a single bill, each with its own transaction detail section (for example, more than one \"DETALLE DE CUENTA\" block under different card numbers) — when that happens, extract the transactions from EVERY section and combine them into one single transactions array; never skip a section, and never leave transactions empty just because there is more than one detail section. A statement can legitimately have 100-300+ individual transactions — that is normal, not a reason to summarize or shorten the list: list every single transaction line individually, in full, no matter how many there are. Never collapse repeated merchants into one entry, never truncate the array for length, and never return an empty transactions array while other fields are filled in — if you can read the balances and dates, you can read the transaction lines too. Amounts: use negative numbers for purchases/charges and positive numbers for payments or credits, regardless of how they're printed on the statement. If a value is not present, omit it rather than guessing. Do not guess a spending category — that is handled separately. Some lines are instalment/cuotas purchases showing a progress marker next to the merchant, e.g. '4/12', '4 DE 12', or 'CUOTA 04-12', sometimes with a rate like '1.2% MENSUAL' nearby — when you see this, fill the transaction's plan field with the progress exactly as printed and plan_rate with the rate if shown; leave both fields out entirely for a normal one-time charge. Fill previous_balance with the printed previous balance (\"Saldo anterior\") and never list it as a transaction. The numbers must reconcile: previous_balance minus payments and credits plus all charges (purchases, interest, fees, taxes such as ITBMS, insurance, installments) equals balance — if your lines don't add up, look again for the missing ones.";

const NOT_A_TRANSACTION = /^\s*(saldo\s+(anterior|inicial|previo)|balance\s+(anterior|forward)|previous\s+balance)\b/i;

// balance - (previous_balance - sum(amounts)); null when it can't be checked.
function balanceGap(p: any): number | null {
  const prev = Number(p?.previous_balance);
  const bal = Number(p?.balance);
  if (!Number.isFinite(prev) || !Number.isFinite(bal) || !Array.isArray(p?.transactions)) return null;
  const net = p.transactions
    .filter((t: any) => !NOT_A_TRANSACTION.test(String(t?.merchant ?? "")))
    .reduce((n: number, t: any) => n + Number(t?.amount || 0), 0);
  return Math.round((bal - (prev - net)) * 100) / 100;
}

async function extract(messages: unknown[]): Promise<{ input: any; content: unknown; toolUseId: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_statement" },
      messages,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 500)}`);
  }
  const json = await res.json();
  const toolUse = json.content?.find((b: any) => b.type === "tool_use");
  if (!toolUse) throw new Error("The model did not return structured data.");
  return { input: toolUse.input, content: json.content, toolUseId: toolUse.id };
}

// Parsing regularly takes 30-45+ seconds, long enough that someone waiting on
// this screen may well switch tabs or background the app — this is the only
// signal they get back once it's actually done, wherever they went.
async function notify(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  msg: (isEs: boolean) => { title: string; body: string },
  data: Record<string, unknown>,
) {
  try {
    const { data: profile } = await supabase.from("profiles").select("push_token, lang").eq("id", userId).single();
    const pushToken = profile?.push_token as string | undefined;
    if (!pushToken) return;
    const { title, body } = msg(profile?.lang === "es");
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ to: pushToken, title, body, data }),
    });
  } catch {
    // Push delivery is best-effort — never fail the request over a notification.
  }
}

// Downloads the PDF and reads it, with the balance self-check: previous
// balance - payments + charges must equal the new balance. When it doesn't,
// the reader skipped or misread a line; give it the numbers once and let it
// look again, keeping whichever reading is closer. Costs a second call only
// for statements that don't add up.
async function readStatement(supabase: ReturnType<typeof createClient>, storagePath: string): Promise<any> {
  const { data: fileBlob, error: dlErr } = await supabase.storage.from("statements").download(storagePath);
  if (dlErr || !fileBlob) {
    throw new Error(`Could not download the PDF: ${dlErr?.message ?? "unknown error"}`);
  }
  const base64 = encodeBase64(new Uint8Array(await fileBlob.arrayBuffer()));
  const userContent = [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
    { type: "text", text: EXTRACT_PROMPT_TEXT },
  ];
  const first = await extract([{ role: "user", content: userContent }]);
  let parsed = first.input;

  const firstGap = balanceGap(parsed);
  if (firstGap !== null && Math.abs(firstGap) >= 0.01) {
    try {
      const second = await extract([
        { role: "user", content: userContent },
        { role: "assistant", content: first.content },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: first.toolUseId,
              content:
                `Check failed: previous_balance (${parsed.previous_balance}) minus the sum of your transaction amounts should equal balance (${parsed.balance}), ` +
                `but it is off by ${firstGap.toFixed(2)}. Some line is missing, duplicated or misread. Go through EVERY section of the statement again ` +
                `(each cardholder/sub-account, interest, fees, ITBMS tax, insurance, financing and installment lines, credits and reversals) and call ` +
                `extract_statement again with the complete, corrected data. Do not invent a line just to make it balance.`,
            },
          ],
        },
      ]);
      const secondGap = balanceGap(second.input);
      if (secondGap !== null && Math.abs(secondGap) < Math.abs(firstGap)) parsed = second.input;
    } catch {
      // Keep the first reading if the second attempt fails.
    }
  }
  return parsed;
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

  let statementId: string | undefined;
  // A re-read never touches the saved reading or its status, not even on errors.
  let isReread = false;
  try {
    const body = await req.json();
    statementId = body.statementId;
    isReread = body.reread === true;
    if (!statementId) {
      return new Response(JSON.stringify({ error: "statementId is required" }), { status: 400, headers: corsHeaders });
    }

    const { data: statement, error: stmtErr } = await supabase
      .from("statements")
      .select("*")
      .eq("id", statementId)
      .single();
    if (stmtErr || !statement) {
      return new Response(JSON.stringify({ error: "Statement not found" }), { status: 404, headers: corsHeaders });
    }
    if (!statement.storage_path) {
      return new Response(JSON.stringify({ error: "Statement has no file" }), { status: 400, headers: corsHeaders });
    }

    if (!ANTHROPIC_API_KEY) {
      if (!isReread) await supabase.from("statements").update({
        status: "failed",
        error_message: "Parsing is not configured yet (missing ANTHROPIC_API_KEY).",
      }).eq("id", statementId);
      return new Response(JSON.stringify({ error: "Parsing is not configured yet." }), { status: 503, headers: corsHeaders });
    }

    // "Volver a leer" on a saved statement: answer right away and keep
    // working in the background, so leaving the screen or the app doesn't
    // lose it. The result goes next to the saved reading (reread_parsed),
    // which stays untouched until the user picks one.
    if (isReread) {
      const startedAt = new Date().toISOString();
      const { error: markErr } = await supabase
        .from("statements")
        .update({ reread_status: "reading", reread_started_at: startedAt, reread_parsed: null, reread_error: null })
        .eq("id", statementId);
      if (markErr) throw new Error(markErr.message);

      const work = (async () => {
        try {
          const parsed = await readStatement(supabase, statement.storage_path);
          await supabase
            .from("statements")
            .update({ reread_parsed: parsed, reread_status: "ready", reread_error: null })
            .eq("id", statementId)
            .eq("reread_started_at", startedAt);
          const gap = balanceGap(parsed);
          const bank = parsed.bank ?? statement.bank ?? "";
          await notify(
            supabase,
            statement.user_id,
            (isEs) => ({
              title: isEs ? "Nueva lectura lista" : "New reading ready",
              body: isEs
                ? `${bank}${gap !== null && Math.abs(gap) < 0.01 ? " — ahora cuadra." : "."} Ábrela para comparar y elegir cuál quedarte.`
                : `${bank}${gap !== null && Math.abs(gap) < 0.01 ? " — it now balances." : "."} Open it to compare and pick one.`,
            }),
            { statementId, type: "reread_ready" },
          );
        } catch (e) {
          await supabase
            .from("statements")
            .update({ reread_status: "failed", reread_error: e instanceof Error ? e.message : "Unknown error" })
            .eq("id", statementId)
            .eq("reread_started_at", startedAt);
        }
      })();
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(work);
      else await work;

      return new Response(JSON.stringify({ started: true, startedAt }), {
        status: 202,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const parsed = await readStatement(supabase, statement.storage_path);

    await supabase
      .from("statements")
      .update({ parsed, status: "needs_review", error_message: null, bank: parsed.bank ?? statement.bank })
      .eq("id", statementId);

    const bank = parsed.bank ?? statement.bank ?? "Your card";
    const txCount = parsed.transactions?.length ?? 0;
    await notify(
      supabase,
      statement.user_id,
      (isEs) => ({
        title: isEs ? "Estado de cuenta listo para revisar" : "Statement ready to review",
        body: isEs
          ? `${bank} — ${txCount} ${txCount === 1 ? "transacción encontrada" : "transacciones encontradas"}. Abre la app para revisarlo.`
          : `${bank} — ${txCount} transaction${txCount === 1 ? "" : "s"} found. Open the app to review.`,
      }),
      { statementId, type: "statement_ready" },
    );

    return new Response(JSON.stringify({ parsed }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (statementId && !isReread) {
      await supabase.from("statements").update({ status: "failed", error_message: message }).eq("id", statementId);
    }
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
