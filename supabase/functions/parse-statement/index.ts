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

// Parsing regularly takes 30-45+ seconds, long enough that someone waiting on
// this screen may well switch tabs or background the app — this is the only
// signal they get back once it's actually done, wherever they went.
async function notifyParsed(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  statementId: string,
  bank: string,
  txCount: number,
) {
  try {
    const { data: profile } = await supabase.from("profiles").select("push_token, lang").eq("id", userId).single();
    const pushToken = profile?.push_token as string | undefined;
    if (!pushToken) return;
    const isEs = profile?.lang === "es";
    const title = isEs ? "Estado de cuenta listo para revisar" : "Statement ready to review";
    const body = isEs
      ? `${bank} — ${txCount} ${txCount === 1 ? "transacción encontrada" : "transacciones encontradas"}. Abre la app para revisarlo.`
      : `${bank} — ${txCount} transaction${txCount === 1 ? "" : "s"} found. Open the app to review.`;
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ to: pushToken, title, body, data: { statementId, type: "statement_ready" } }),
    });
  } catch {
    // Push delivery is best-effort — never fail the request over a notification.
  }
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
  try {
    const body = await req.json();
    statementId = body.statementId;
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
      await supabase.from("statements").update({
        status: "failed",
        error_message: "Parsing is not configured yet (missing ANTHROPIC_API_KEY).",
      }).eq("id", statementId);
      return new Response(JSON.stringify({ error: "Parsing is not configured yet." }), { status: 503, headers: corsHeaders });
    }

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from("statements")
      .download(statement.storage_path);
    if (dlErr || !fileBlob) {
      throw new Error(`Could not download the PDF: ${dlErr?.message ?? "unknown error"}`);
    }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const base64 = encodeBase64(bytes);

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 16000,
        output_config: { effort: "medium" },
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "tool", name: "extract_statement" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: base64 },
              },
              {
                type: "text",
                text: "This is a credit card statement, possibly in Spanish, from a bank in Panama. Extract every field and every transaction line using the extract_statement tool. Some statements combine multiple card sub-accounts on a single bill, each with its own transaction detail section (for example, more than one \"DETALLE DE CUENTA\" block under different card numbers) — when that happens, extract the transactions from EVERY section and combine them into one single transactions array; never skip a section, and never leave transactions empty just because there is more than one detail section. A statement can legitimately have 100-300+ individual transactions — that is normal, not a reason to summarize or shorten the list: list every single transaction line individually, in full, no matter how many there are. Never collapse repeated merchants into one entry, never truncate the array for length, and never return an empty transactions array while other fields are filled in — if you can read the balances and dates, you can read the transaction lines too. Amounts: use negative numbers for purchases/charges and positive numbers for payments or credits, regardless of how they're printed on the statement. If a value is not present, omit it rather than guessing. Do not guess a spending category — that is handled separately. Some lines are instalment/cuotas purchases showing a progress marker next to the merchant, e.g. '4/12', '4 DE 12', or 'CUOTA 04-12', sometimes with a rate like '1.2% MENSUAL' nearby — when you see this, fill the transaction's plan field with the progress exactly as printed and plan_rate with the rate if shown; leave both fields out entirely for a normal one-time charge.",
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API error (${anthropicRes.status}): ${errText.slice(0, 500)}`);
    }

    const anthropicJson = await anthropicRes.json();
    const toolUse = anthropicJson.content?.find((b: any) => b.type === "tool_use");
    if (!toolUse) {
      throw new Error("The model did not return structured data.");
    }
    const parsed = toolUse.input;

    await supabase
      .from("statements")
      .update({ parsed, status: "needs_review", error_message: null, bank: parsed.bank ?? statement.bank })
      .eq("id", statementId);

    await notifyParsed(supabase, statement.user_id, statementId, parsed.bank ?? statement.bank ?? "Your card", parsed.transactions?.length ?? 0);

    return new Response(JSON.stringify({ parsed }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (statementId) {
      await supabase.from("statements").update({ status: "failed", error_message: message }).eq("id", statementId);
    }
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
