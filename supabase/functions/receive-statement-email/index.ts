import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
const MAILGUN_WEBHOOK_SIGNING_KEY = Deno.env.get("MAILGUN_WEBHOOK_SIGNING_KEY");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const MAILGUN_DOMAIN = "stmts.poquetapp.com";
const REPLAY_WINDOW_MS = 15 * 60 * 1000;

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyMailgunSignature(timestamp: string, token: string, signature: string): Promise<boolean> {
  if (!MAILGUN_WEBHOOK_SIGNING_KEY) return false;
  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > REPLAY_WINDOW_MS) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(MAILGUN_WEBHOOK_SIGNING_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(timestamp + token));
  const hex = Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqualHex(hex, signature.toLowerCase());
}

function extractToken(recipient: string): string | null {
  const match = recipient.match(/<?([^<>\s]+)@/);
  const localPart = match ? match[1] : recipient.split("@")[0];
  const m = localPart.match(/^u-(.+)$/i);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Gmail forwarding confirmation
//
// Gmail won't auto-forward to a new address until the owner confirms it, and
// it sends the confirmation to that address — i.e. to us — from
// forwarding-noreply@google.com. Older messages carry a numeric code in the
// subject ("(#99427480) Gmail Forwarding Confirmation - Receive Mail from
// you@gmail.com"); current ones carry a confirmation link instead. We save
// whichever we get on the profile (the app shows it in Statements), push it,
// and email it back to the Gmail account that asked, where the user already is.
// ---------------------------------------------------------------------------
const GMAIL_FWD_SENDER = "forwarding-noreply@google.com";
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const GOOGLE_LINK_RE = /https:\/\/[a-z0-9.-]*google\.com\/[^\s<>"'\]]+/gi;

function findConfirmationLink(text: string): string | null {
  const links = (text.replace(/&amp;/g, "&").match(GOOGLE_LINK_RE) ?? []).map((l) => l.replace(/[.,;)]+$/, ""));
  return links.find((l) => /\/vf-|vf%2d|confirm/i.test(l)) ?? links.find((l) => /mail-settings\.google\.com/i.test(l)) ?? null;
}

export function parseGmailForwardingConfirmation(
  senderFields: string,
  subject: string,
  body: string,
): { code: string | null; link: string | null; requester: string | null } | null {
  if (!senderFields.toLowerCase().includes(GMAIL_FWD_SENDER)) return null;
  const code =
    subject.match(/\(#(\d{5,12})\)/)?.[1] ??
    body.match(/(?:confirmation code|c[oó]digo de confirmaci[oó]n)\s*:?\s*(\d{5,12})/i)?.[1] ??
    null;
  const link = findConfirmationLink(body);
  if (!code && !link) return null;
  // The requesting account is the last address in the subject
  // ("... Receive Mail from you@gmail.com"); the body is the fallback.
  const inSubject = subject.match(EMAIL_RE) ?? [];
  const inBody = (body.match(/(?:receive mail from|recibir correo de)\s+([^\s<>]+@[^\s<>]+)/i)?.[1]) ?? null;
  const requester = (inSubject[inSubject.length - 1] ?? inBody ?? null)?.toLowerCase().replace(/[.,;)]+$/, "") ?? null;
  return { code, link, requester };
}

// Mailgun adds SPF/DKIM results to the forwarded headers. If they are present
// and both say the message isn't authentic, don't email anyone on its behalf.
function senderLooksAuthentic(messageHeaders: string): boolean {
  try {
    const headers = JSON.parse(messageHeaders) as [string, string][];
    const get = (name: string) => headers.find(([k]) => k.toLowerCase() === name)?.[1]?.toLowerCase();
    const spf = get("x-mailgun-spf");
    const dkim = get("x-mailgun-dkim-check-result");
    if (spf === undefined && dkim === undefined) return true;
    return spf === "pass" || dkim === "pass";
  } catch {
    return true;
  }
}

function isNoReplyAddress(address: string): boolean {
  return /(no-?reply|noreply|no-responder|mailer-daemon|postmaster)/i.test(address);
}

async function sendGmailConfirmEmail(
  toAddress: string,
  recipientAddress: string,
  code: string | null,
  link: string | null,
  isEs: boolean,
) {
  if (!MAILGUN_API_KEY) return;
  try {
    const es = [
      `Gmail te pidió confirmar el reenvío a tu dirección de Poquet (${recipientAddress}).`,
      link ? `Confírmalo aquí:\n${link}` : "",
      code ? `Código de verificación: ${code}\n(Pégalo en Gmail → Configuración → Reenvío y correo POP/IMAP y toca Verificar.)` : "",
      `Después crea el filtro para tu banco: https://poquetapp.com/guia-reenvio/#gmail`,
      `Si no fuiste tú, ignora este correo: sin confirmar, Gmail no reenvía nada.`,
    ];
    const en = [
      `Gmail asked you to confirm forwarding to your Poquet address (${recipientAddress}).`,
      link ? `Confirm it here:\n${link}` : "",
      code ? `Verification code: ${code}\n(Paste it in Gmail → Settings → Forwarding and POP/IMAP and tap Verify.)` : "",
      `Then create the filter for your bank: https://poquetapp.com/guia-reenvio/#gmail`,
      `If this wasn't you, ignore this email: without confirming, Gmail won't forward anything.`,
    ];
    const form = new FormData();
    form.append("from", `Poquet <no-responder@${MAILGUN_DOMAIN}>`);
    form.append("to", toAddress);
    form.append(
      "subject",
      isEs
        ? code ? `Confirma el reenvío de Gmail a Poquet (código ${code})` : "Confirma el reenvío de Gmail a Poquet"
        : code ? `Confirm Gmail forwarding to Poquet (code ${code})` : "Confirm Gmail forwarding to Poquet",
    );
    form.append("text", (isEs ? es : en).filter(Boolean).join("\n\n"));
    await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: form,
    });
  } catch {
    // Best-effort — the confirmation is also saved for the app and pushed.
  }
}

async function sendPush(pushToken: string | null | undefined, title: string, body: string, data?: Record<string, unknown>) {
  if (!pushToken) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ to: pushToken, title, body, ...(data ? { data } : {}) }),
    });
  } catch {
    // Best-effort — push delivery never blocks the actual processing.
  }
}

async function sendNoPdfNotice(toAddress: string, recipientAddress: string) {
  if (!MAILGUN_API_KEY) return;
  try {
    const form = new FormData();
    form.append("from", `Poquet <no-responder@${MAILGUN_DOMAIN}>`);
    form.append("to", toAddress);
    form.append("subject", "No encontramos el PDF adjunto / We couldn't find a PDF attached");
    form.append(
      "text",
      `Recibimos tu correo en ${recipientAddress} pero no traía ningún archivo PDF adjunto, así que no pudimos procesarlo.\n\n` +
        `Si fue un error, vuelve a enviarlo adjuntando el PDF del estado de cuenta a esta misma dirección.\n\n` +
        `—\n\n` +
        `We received your email at ${recipientAddress} but it didn't include a PDF attachment, so we couldn't process it.\n\n` +
        `If this was a mistake, please resend it with the statement PDF attached to this same address.`,
    );
    await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: form,
    });
  } catch {
    // Best-effort — never fail the webhook over a courtesy notice.
  }
}

async function sendReceivedNotice(toAddress: string, isEs: boolean, count: number) {
  if (!MAILGUN_API_KEY) return;
  try {
    const form = new FormData();
    form.append("from", `Poquet <no-responder@${MAILGUN_DOMAIN}>`);
    form.append("to", toAddress);
    form.append(
      "subject",
      isEs
        ? count === 1
          ? "Recibimos tu estado de cuenta"
          : `Recibimos ${count} estados de cuenta`
        : count === 1
          ? "We received your statement"
          : `We received ${count} statements`,
    );
    form.append(
      "text",
      isEs
        ? count === 1
          ? "Recibimos tu estado de cuenta y ya lo estamos procesando. Te avisamos cuando esté listo para revisar en la app."
          : `Recibimos ${count} estados de cuenta y ya los estamos procesando. Te avisamos cuando estén listos para revisar en la app.`
        : count === 1
          ? "We received your statement and we're processing it now. We'll let you know when it's ready to review in the app."
          : `We received ${count} statements and we're processing them now. We'll let you know when they're ready to review in the app.`,
    );
    await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: form,
    });
  } catch {
    // Best-effort — a confirmation email is a nice-to-have, never worth failing the webhook over.
  }
}

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

const EXTRACT_PROMPT_TEXT =
  "This is a credit card statement, possibly in Spanish, from a bank in Panama. Extract every field and every transaction line using the extract_statement tool. Some statements combine multiple card sub-accounts on a single bill, each with its own transaction detail section (for example, more than one \"DETALLE DE CUENTA\" block under different card numbers) — when that happens, extract the transactions from EVERY section and combine them into one single transactions array; never skip a section, and never leave transactions empty just because there is more than one detail section. A statement can legitimately have 100-300+ individual transactions — that is normal, not a reason to summarize or shorten the list: list every single transaction line individually, in full, no matter how many there are. Never collapse repeated merchants into one entry, never truncate the array for length, and never return an empty transactions array while other fields are filled in — if you can read the balances and dates, you can read the transaction lines too. Amounts: use negative numbers for purchases/charges and positive numbers for payments or credits, regardless of how they're printed on the statement. If a value is not present, omit it rather than guessing. Do not guess a spending category — that is handled separately. Some lines are instalment/cuotas purchases showing a progress marker next to the merchant, e.g. '4/12', '4 DE 12', or 'CUOTA 04-12', sometimes with a rate like '1.2% MENSUAL' nearby — when you see this, fill the transaction's plan field with the progress exactly as printed and plan_rate with the rate if shown; leave both fields out entirely for a normal one-time charge.";

// Runs entirely in-process instead of calling the separate parse-statement
// function over HTTP — a server-to-server call from one edge function to
// another on this project consistently 404s (tried twice, two different
// ways), so this avoids that failure mode altogether. We already have the
// PDF bytes in memory from the upload, so there's no extra download either.
async function parseAndSaveStatement(
  admin: ReturnType<typeof createClient>,
  statementId: string,
  bytes: Uint8Array,
  isEs: boolean,
  pushToken: string | null | undefined,
) {
  try {
    if (!ANTHROPIC_API_KEY) {
      await admin.from("statements").update({
        status: "failed",
        error_message: "Parsing is not configured yet (missing ANTHROPIC_API_KEY).",
      }).eq("id", statementId);
      return;
    }

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
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: EXTRACT_PROMPT_TEXT },
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
    if (!toolUse) throw new Error("The model did not return structured data.");
    const parsed = toolUse.input;

    await admin
      .from("statements")
      .update({ parsed, status: "needs_review", error_message: null, bank: parsed.bank ?? null })
      .eq("id", statementId);

    const bank = parsed.bank ?? (isEs ? "Tu tarjeta" : "Your card");
    const txCount = parsed.transactions?.length ?? 0;
    const title = isEs ? "Estado de cuenta listo para revisar" : "Statement ready to review";
    const body = isEs
      ? `${bank} — ${txCount} transacción${txCount === 1 ? "" : "es"} encontrada${txCount === 1 ? "" : "s"}. Abre la app para revisarlo.`
      : `${bank} — ${txCount} transaction${txCount === 1 ? "" : "s"} found. Open the app to review.`;
    await sendPush(pushToken, title, body, { statementId, type: "statement_ready" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await admin.from("statements").update({ status: "failed", error_message: message }).eq("id", statementId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response("ok", { status: 200 });
  }

  const timestamp = String(form.get("timestamp") ?? "");
  const token = String(form.get("token") ?? "");
  const signature = String(form.get("signature") ?? "");
  const valid = timestamp && token && signature && (await verifyMailgunSignature(timestamp, token, signature));
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const recipient = String(form.get("recipient") ?? "");
  const sender = String(form.get("from") ?? form.get("sender") ?? "");
  const userToken = extractToken(recipient);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (!userToken) {
    return new Response("ok", { status: 200 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, push_token, lang, gmail_fwd_code, gmail_fwd_link, gmail_fwd_at")
    .eq("statement_email_token", userToken)
    .maybeSingle();

  if (!profile) {
    return new Response("ok", { status: 200 });
  }

  const pdfAttachments: { name: string; bytes: Uint8Array }[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("attachment-")) continue;
    if (!(value instanceof File)) continue;
    const looksLikePdf = value.type === "application/pdf" || value.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) continue;
    pdfAttachments.push({ name: value.name || "statement.pdf", bytes: new Uint8Array(await value.arrayBuffer()) });
  }

  const isEs = profile.lang === "es";
  const pushToken = profile.push_token as string | undefined;

  if (pdfAttachments.length === 0) {
    const senderFields = `${String(form.get("from") ?? "")} ${String(form.get("sender") ?? "")}`;
    const subject = String(form.get("subject") ?? "");
    const bodyText = `${String(form.get("body-plain") ?? "")}\n${String(form.get("body-html") ?? "")}`;
    const fwd = parseGmailForwardingConfirmation(senderFields, subject, bodyText);
    // Diagnostic only, no personal data: what kind of no-PDF mail arrived.
    console.log(JSON.stringify({
      event: "no_pdf_mail",
      fromGoogle: senderFields.toLowerCase().includes(GMAIL_FWD_SENDER),
      gmailConfirmation: !!fwd,
      hasCode: !!fwd?.code,
      hasLink: !!fwd?.link,
    }));
    if (fwd) {
      // Gmail re-sends the same confirmation if the user clicks "resend"; only
      // notify again after a minute so a burst can't turn us into a mail cannon.
      const prevAt = profile.gmail_fwd_at ? Date.parse(profile.gmail_fwd_at as string) : 0;
      const same = (fwd.code ?? null) === (profile.gmail_fwd_code ?? null) && (fwd.link ?? null) === (profile.gmail_fwd_link ?? null);
      const recentlySent = same && Date.now() - prevAt < 60_000;

      await admin
        .from("profiles")
        .update({
          gmail_fwd_code: fwd.code,
          gmail_fwd_link: fwd.link,
          gmail_fwd_from: fwd.requester,
          gmail_fwd_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      if (!recentlySent) {
        await sendPush(
          pushToken,
          fwd.code
            ? (isEs ? `Código de Gmail: ${fwd.code}` : `Gmail code: ${fwd.code}`)
            : (isEs ? "Confirma el reenvío de Gmail" : "Confirm Gmail forwarding"),
          isEs
            ? "Te lo enviamos a tu Gmail y también está en Estados."
            : "We sent it to your Gmail, and it's also in Statements.",
          { type: "gmail_forwarding_code" },
        );
        if (fwd.requester && senderLooksAuthentic(String(form.get("message-headers") ?? ""))) {
          await sendGmailConfirmEmail(fwd.requester, recipient, fwd.code, fwd.link, isEs);
        }
      }
      return new Response("ok", { status: 200 });
    }

    // Never answer automated senders — they can't read it, and it can loop.
    if (sender && !isNoReplyAddress(sender)) await sendNoPdfNotice(sender, recipient);
    return new Response("ok", { status: 200 });
  }

  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;

  let created = 0;
  for (const att of pdfAttachments) {
    const path = `${profile.id}/${Date.now()}-${att.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadErr } = await admin.storage.from("statements").upload(path, att.bytes, {
      contentType: "application/pdf",
    });
    if (uploadErr) continue;

    const { data: statement, error: insertErr } = await admin
      .from("statements")
      .insert({ user_id: profile.id, source: "email", status: "pending", storage_path: path })
      .select("id")
      .single();
    if (insertErr || !statement) continue;

    created++;
    const task = parseAndSaveStatement(admin, statement.id, att.bytes, isEs, pushToken);
    if (rt?.waitUntil) rt.waitUntil(task); else task.catch(() => {});
  }

  if (created > 0) {
    const title = isEs ? "Estado de cuenta recibido" : "Statement received";
    const body = isEs
      ? created === 1
        ? "Lo recibimos y ya lo estamos procesando."
        : `Recibimos ${created} estados de cuenta y ya los estamos procesando.`
      : created === 1
        ? "We got it and we're processing it now."
        : `We received ${created} statements and are processing them now.`;
    await sendPush(pushToken, title, body, { type: "statement_received" });
    if (sender) await sendReceivedNotice(sender, isEs, created);
  }

  return new Response("ok", { status: 200 });
});
