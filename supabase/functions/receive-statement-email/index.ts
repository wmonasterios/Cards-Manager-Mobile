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
const LINK_RE = /https:\/\/[^\s<>"'\]]+/gi;
// Only these hosts serve Gmail's forwarding confirmation. Matched exactly on
// the parsed URL: a pattern like "*google.com/" also accepts evilgoogle.com,
// and this link is opened from the app and emailed out from our domain.
const GMAIL_CONFIRM_HOSTS = new Set(["mail-settings.google.com", "mail.google.com"]);

function isGmailConfirmHost(link: string): boolean {
  try {
    const u = new URL(link);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && GMAIL_CONFIRM_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function findConfirmationLink(text: string): string | null {
  const links = (text.replace(/&amp;/g, "&").match(LINK_RE) ?? [])
    .map((l) => l.replace(/[.,;)]+$/, ""))
    .filter(isGmailConfirmHost);
  return links.find((l) => /\/vf-|vf%2d|confirm/i.test(l)) ?? links.find((l) => /mail-settings\.google\.com/i.test(l)) ?? null;
}

// The bare address of a header like `Gmail Team <forwarding-noreply@google.com>`.
function headerAddress(field: string): string | null {
  const m = field.match(/<([^<>\s]+@[^<>\s]+)>\s*$/) ?? field.match(/^\s*([^<>\s]+@[^<>\s]+)\s*$/);
  return m ? m[1].toLowerCase() : null;
}

export function parseGmailForwardingConfirmation(
  fromHeader: string,
  subject: string,
  body: string,
): { code: string | null; link: string | null; requester: string | null } | null {
  if (headerAddress(fromHeader) !== GMAIL_FWD_SENDER) return null;
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

// Whether Google itself handed this message to Mailgun: the SMTP envelope
// sender (Mailgun's `sender` field, not the From header) is
// forwarding-noreply@google.com and Mailgun's own Authentication-Results says
// DMARC passed for header.from=google.com and DKIM passed for
// header.d=google.com. Fails closed. Anyone with a Poquet account can mail
// their own forwarding address with a forged From, so without this we'd email
// whatever address their subject names, from our domain. Only the email back to the requester
// depends on it; saving the code/link and the push only reach the address's
// owner.
//
// Mailgun doesn't send X-Mailgun-Spf on routed mail (checked on a real Gmail
// confirmation, 26 Oct 2026). It prepends its trace headers — Received,
// Authentication-Results from mx*.mailgun.org, X-Mailgun-Incoming,
// X-Envelope-From — above the sender's own, so only an Authentication-Results
// before the first X-Mailgun-Incoming is Mailgun's; one further down could
// have been written by the sender.
function sentByGoogle(envelopeSender: string, messageHeaders: string): { ok: boolean; envelopeGoogle: boolean; dmarcGoogle: boolean } {
  // Exactly Google's address, not just its domain: Mailgun echoes the
  // envelope sender inside its Authentication-Results (smtp.mailfrom="…"),
  // and a quoted local part could otherwise smuggle text into it.
  const envelopeGoogle = headerAddress(envelopeSender) === GMAIL_FWD_SENDER;
  let dmarcGoogle = false;
  try {
    const headers = JSON.parse(messageHeaders) as [string, string][];
    const mailgunEnd = headers.findIndex(([k]) => k.toLowerCase() === "x-mailgun-incoming");
    const results = mailgunEnd < 0 ? [] : headers
      .slice(0, mailgunEnd)
      .filter(([k, v]) => k.toLowerCase() === "authentication-results" && /^\s*mx[a-z0-9-]*\.mailgun\.org\s*;/i.test(String(v ?? "")));
    dmarcGoogle = results.some(([, v]) => {
      const res = authResults(String(v));
      if (!res) return false;
      // Every result for google.com must pass, not just one: should a
      // sender-controlled value ever reach this header unquoted, text it
      // injects still sits next to Mailgun's genuine "dmarc=fail
      // header.from=google.com" for a forged From, and that one can't be removed.
      const allPass = (method: string, prop: string, value: string) => {
        const mine = res.filter((r) => r.method === method && r.props[prop] === value);
        return mine.length > 0 && mine.every((r) => r.result === "pass");
      };
      return allPass("dmarc", "header.from", "google.com") && allPass("dkim", "header.d", "google.com");
    });
  } catch {
    // No parsable headers: not provably Google.
  }
  return { ok: envelopeGoogle && dmarcGoogle, envelopeGoogle, dmarcGoogle };
}

// The results in an Authentication-Results value (RFC 8601), or null when it
// can't be read safely. Quoted strings and (nested) comments are removed
// first — they hold sender-controlled text such as smtp.mailfrom and
// smtp.helo, which may contain ";" or "=" — and anything left unbalanced
// fails closed.
function authResults(value: string): { method: string; result: string; props: Record<string, string> }[] | null {
  let s = value.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  for (let prev = ""; prev !== s;) {
    prev = s;
    s = s.replace(/\([^()]*\)/g, " ");
  }
  if (/[()\\]/.test(s) || (s.match(/"/g) ?? []).length % 2 !== 0) return null;
  return s.split(";").slice(1).map((part) => {
    const [head, ...rest] = part.trim().split(/\s+/);
    const [method, result] = (head ?? "").toLowerCase().split("=");
    const props: Record<string, string> = {};
    for (const kv of rest) {
      const i = kv.indexOf("=");
      if (i > 0) props[kv.slice(0, i).toLowerCase()] = kv.slice(i + 1).toLowerCase();
    }
    return { method: method ?? "", result: result ?? "", props };
  });
}

// ---------------------------------------------------------------------------
// Change alerts
//
// Both checks above fail closed, so when Google or Mailgun change how a
// confirmation looks, nothing breaks loudly: the email back just stops (Oct
// 2026, Mailgun never sent X-Mailgun-Spf). Two things should never happen on
// a normal day — mail from google.com that doesn't read as a confirmation, and
// a confirmation that doesn't authenticate as Google — so either one emails
// support@poquetapp.com, at most once a day per kind (claim_ops_alert). The
// alert carries what's needed to see what changed and nothing about the user:
// no subject, body, requester or link, only hosts and Mailgun's verdict.
// Someone forging a confirmation to their own address also triggers the
// second kind, which is worth knowing too.
// ---------------------------------------------------------------------------
const SUPPORT_TO = "support@poquetapp.com";

function isGoogleAddress(address: string | null): boolean {
  const domain = (address ?? "").split("@")[1] ?? "";
  return domain === "google.com" || domain.endsWith(".google.com");
}

async function alertOps(admin: ReturnType<typeof createClient>, kind: string, details: Record<string, unknown>) {
  if (!MAILGUN_API_KEY) return;
  try {
    const { data: seen, error } = await admin.rpc("claim_ops_alert", { p_kind: kind });
    if (error || typeof seen !== "number") return;
    const lines = [
      `receive-statement-email saw "${kind}" (${seen} time${seen === 1 ? "" : "s"} since the last alert of this kind; next alert in 24 h at the earliest).`,
      kind === "gmail_fwd_unreadable"
        ? "Mail from google.com reached a forwarding address but didn't parse as a Gmail forwarding confirmation (sender, link host or code format changed?). The user sees a card asking them to contact support."
        : "A Gmail forwarding confirmation was parsed but didn't authenticate as Google, so it wasn't emailed back (envelope sender or Mailgun's Authentication-Results changed? or someone forged one to their own address). The user still gets the push and the card.",
      "",
      ...Object.entries(details).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`),
      "",
      "Code: supabase/functions/receive-statement-email (parseGmailForwardingConfirmation, sentByGoogle).",
    ];
    const form = new FormData();
    form.append("from", `Poquet <no-responder@${MAILGUN_DOMAIN}>`);
    form.append("to", SUPPORT_TO);
    form.append("subject", `[Poquet alert] Gmail forwarding: ${kind}`);
    form.append("text", lines.join("\n"));
    await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: form,
    });
  } catch {
    // Best-effort: the log line still records it.
  }
}

// What an alert says about a message: hosts and verdicts, never content.
function alertDetails(fromHeader: string, envelopeSender: string, subject: string, body: string, messageHeaders: string) {
  let headerNames: string[] = [];
  let mailgunAuth: string | null = null;
  try {
    const headers = JSON.parse(messageHeaders) as [string, string][];
    headerNames = headers.map(([k]) => k);
    mailgunAuth = headers.find(([k, v]) => k.toLowerCase() === "authentication-results" && /mailgun\.org/i.test(String(v)))?.[1]?.slice(0, 600) ?? null;
  } catch {
    // Leave them empty.
  }
  const hosts = [...new Set((body.replace(/&amp;/g, "&").match(LINK_RE) ?? []).map((l) => {
    try {
      return new URL(l).hostname.toLowerCase();
    } catch {
      return null;
    }
  }).filter(Boolean))].slice(0, 8);
  return {
    from: isGoogleAddress(headerAddress(fromHeader)) ? headerAddress(fromHeader) : "(not google.com)",
    envelope_domain: (headerAddress(envelopeSender) ?? "").split("@")[1] ?? "(none)",
    subject_has_code: /\(#\d{5,12}\)/.test(subject),
    link_hosts_in_body: hosts,
    mailgun_authentication_results: mailgunAuth ?? "(none)",
    header_names: headerNames,
  };
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
): Promise<boolean> {
  if (!MAILGUN_API_KEY) return false;
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
    const res = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: form,
    });
    return res.ok;
  } catch {
    // Best-effort — the confirmation is also saved for the app and pushed.
    return false;
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
      currency: { type: "string", description: "ISO currency code of the statement, e.g. USD or COP." },
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
            card_last4: { type: "string", description: "Last 4 digits of the card this line belongs to: the card number in the header of the detail section the line is printed under, or the card number printed on the line itself. Omit for lines in an account-level section that is not tied to one card." },
          },
          required: ["date", "merchant", "amount"],
        },
      },
      cards: {
        type: "array",
        description: "Every card number that has its own transaction detail section (or appears on transaction lines) in this statement.",
        items: {
          type: "object",
          properties: {
            last4: { type: "string" },
            role: { type: "string", description: "As printed, if shown: e.g. 'titular', 'principal', 'adicional'. Omit if not printed. Never a person's name." },
            subtotal: { type: "number", description: "The subtotal the bank prints for this card's section, if any, with the same sign convention as transactions (charges negative). Omit if not printed." },
          },
          required: ["last4"],
        },
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      notes: { type: "string", description: "Anything you were unsure about or could not read." },
    },
    required: ["bank", "currency", "balance", "minimum_payment", "cutoff_date", "due_date", "transactions", "confidence"],
  },
};

const EXTRACT_PROMPT_TEXT =
  "This is a credit card statement, possibly in Spanish, from a bank in Latin America (most often Panama; also Colombia and others). Extract every field and every transaction line using the extract_statement tool. Some statements combine multiple card sub-accounts on a single bill, each with its own transaction detail section (for example, more than one \"DETALLE DE CUENTA\" block under different card numbers) — when that happens, extract the transactions from EVERY section and combine them into one single transactions array; never skip a section, and never leave transactions empty just because there is more than one detail section. A statement can legitimately have 100-300+ individual transactions — that is normal, not a reason to summarize or shorten the list: list every single transaction line individually, in full, no matter how many there are. Never collapse repeated merchants into one entry, never truncate the array for length, and never return an empty transactions array while other fields are filled in — if you can read the balances and dates, you can read the transaction lines too. Amounts: use negative numbers for purchases/charges and positive numbers for payments or credits, regardless of how they're printed on the statement. Some countries print amounts with \".\" for thousands and \",\" for decimals (Colombia: \"1.250.000,00\" means 1250000.00): always return plain numbers with \".\" as the decimal point. If a value is not present, omit it rather than guessing. Do not guess a spending category — that is handled separately. Status words a bank prints next to a description, such as \"CANCELADA\" (a purchase already paid off), are not part of the merchant name: leave them out of merchant. A transaction's amount is always its own value as charged (the \"Valor transacción\" / \"Valor\" / \"Monto\" column), never the columns some banks print beside it for this period's share of it (\"Pago a capital\", \"Saldo pendiente\", \"Saldo diferido\"). A line marked CANCELADA or with cuotas \"0/1\" still counts at its full value: it is a purchase made this period that was already paid off, the bank includes it in the period's total of transactions, and the payment that covered it is listed too — never give it an amount of 0. Some banks print \"1/1\" for every one-time purchase and \"0/36\" on paid-off lines: those are not instalment plans, so leave plan out for them. Some lines are instalment/cuotas purchases showing a progress marker next to the merchant, e.g. '4/12', '4 DE 12', or 'CUOTA 04-12', sometimes with a rate like '1.2% MENSUAL' nearby — when you see this, fill the transaction's plan field with the progress exactly as printed and plan_rate with the rate if shown; leave both fields out entirely for a normal one-time charge. Fill previous_balance with the printed previous balance (\"Saldo anterior\") and never list it as a transaction. The numbers must reconcile: previous_balance minus payments and credits plus all charges (purchases, interest, fees, taxes such as ITBMS, insurance, installments) equals balance — if your lines don't add up, look again for the missing ones. Some banks print interest or fees only in the payment summary (e.g. \"Intereses corrientes\" or \"Otros cargos\" in \"Detalle de pago total\") and not as their own line: when a charge that the balance includes is not listed among the lines, add it as a charge line dated the cutoff date, with that summary label as merchant. Some banks (e.g. in Colombia) also print a section for earlier periods (\"Transacciones de periodos anteriores\"). List its \"1/1\" lines as new charges at their full value: they are purchases that posted after their own period closed, and they are part of this period's total. The only lines to leave out there are deferred purchases past their first cuota (e.g. \"2/36\", with a small \"Pago a capital\"): those were charged in full on an earlier statement and are already in previous_balance. When the statement prints a total for the period's transactions (e.g. \"Valor transacciones del periodo\"), your purchase lines must add up to it. Some accounts have more than one card (the main cardholder plus additional cards, or an old card number that was renewed), each with its own detail section headed by its card number. For EVERY transaction, set card_last4 to the last 4 digits of the card whose section it is printed under (or the card number printed on the line itself). Banks lay this out in two ways: the card number as a header ABOVE its lines, or only in a subtotal line at the END of its block (e.g. \"SUB TOTAL TARJETA: ************0211\"); in the second case the lines between the previous subtotal (or the start of the detail) and that subtotal belong to that card. Look at where each card number sits before assigning lines. Lines in an account-level section that is not under a specific card get no card_last4. List each such card in cards, with its role and printed subtotal when shown. Never include cardholder names.";

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

type CallUsage = { model: string; input: number; output: number; cacheRead: number; cacheWrite: number };

async function extract(messages: unknown[]): Promise<{ input: any; content: unknown; toolUseId: string; usage: CallUsage }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 32000,
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
  const u = json.usage ?? {};
  return {
    input: toolUse.input,
    content: json.content,
    toolUseId: toolUse.id,
    usage: {
      model: "claude-sonnet-5", // the requested id, so it joins model_prices
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    },
  };
}

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
    const userContent = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
      { type: "text", text: EXTRACT_PROMPT_TEXT },
    ];
    const calls: CallUsage[] = [];
    const first = await extract([{ role: "user", content: userContent }]);
    calls.push(first.usage);
    let parsed = first.input;

    // Same self-check as parse-statement: if the lines don't reconcile with
    // the balances, re-read once with the gap and keep the closer reading.
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
        calls.push(second.usage);
        const secondGap = balanceGap(second.input);
        if (secondGap !== null && Math.abs(secondGap) < Math.abs(firstGap)) parsed = second.input;
      } catch {
        // Keep the first reading if the second attempt fails.
      }
    }

    await admin
      .from("statements")
      .update({ parsed, status: "needs_review", error_message: null, bank: parsed.bank ?? null })
      .eq("id", statementId);

    // AI cost of this reading, for per-user cost tracking (ai_usage). Best-effort.
    const { data: owner } = await admin.from("statements").select("user_id").eq("id", statementId).maybeSingle();
    if (owner?.user_id) {
      await admin.from("ai_usage").insert(
        calls.map((c) => ({
          user_id: owner.user_id,
          kind: "email_parse",
          model: c.model,
          input_tokens: c.input,
          output_tokens: c.output,
          cache_read_tokens: c.cacheRead,
          cache_write_tokens: c.cacheWrite,
          statement_id: statementId,
        })),
      ).then(() => {}, () => {});
    }

    const bank = parsed.bank ?? (isEs ? "Tu tarjeta" : "Your card");
    const txCount = parsed.transactions?.length ?? 0;
    const title = isEs ? "Estado de cuenta listo para revisar" : "Statement ready to review";
    const body = isEs
      ? `${bank} — ${txCount} ${txCount === 1 ? "transacción encontrada" : "transacciones encontradas"}. Abre la app para revisarlo.`
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
    .select("id, push_token, lang, gmail_fwd_code, gmail_fwd_link, gmail_fwd_at, gmail_fwd_status")
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
    const fromHeader = String(form.get("from") ?? "");
    const subject = String(form.get("subject") ?? "");
    const bodyText = `${String(form.get("body-plain") ?? "")}\n${String(form.get("body-html") ?? "")}`;
    const envelopeSender = String(form.get("sender") ?? "");
    const messageHeaders = String(form.get("message-headers") ?? "");
    const fwd = parseGmailForwardingConfirmation(fromHeader, subject, bodyText);
    const google = sentByGoogle(envelopeSender, messageHeaders);
    const fromGoogleDomain = isGoogleAddress(headerAddress(fromHeader));
    // Diagnostic only, no personal data: what kind of no-PDF mail arrived.
    console.log(JSON.stringify({
      event: "no_pdf_mail",
      fromGoogle: headerAddress(fromHeader) === GMAIL_FWD_SENDER,
      fromGoogleDomain,
      gmailConfirmation: !!fwd,
      hasCode: !!fwd?.code,
      hasLink: !!fwd?.link,
      envelopeGoogle: google.envelopeGoogle,
      dmarcGoogle: google.dmarcGoogle,
    }));
    const details = () => alertDetails(fromHeader, envelopeSender, subject, bodyText, messageHeaders);

    // Mail from Google that isn't a confirmation we can read: most likely
    // Google changed its format. Tell support, and let the user know from the
    // app rather than leaving them with nothing — unless a readable code/link
    // is already showing, which this mustn't replace.
    if (!fwd && fromGoogleDomain) {
      await alertOps(admin, "gmail_fwd_unreadable", details());
      if (!profile.gmail_fwd_code && !profile.gmail_fwd_link) {
        await admin
          .from("profiles")
          .update({ gmail_fwd_code: null, gmail_fwd_link: null, gmail_fwd_from: null, gmail_fwd_at: new Date().toISOString(), gmail_fwd_status: "unreadable" })
          .eq("id", profile.id);
      }
      return new Response("ok", { status: 200 });
    }

    if (fwd) {
      if (!google.ok) await alertOps(admin, "gmail_fwd_unauthenticated", details());
      const willEmail = !!fwd.requester && google.ok;
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
          // A resend within the minute isn't emailed again; it keeps the
          // status of the one that was.
          ...(recentlySent ? {} : { gmail_fwd_status: "saved" }),
        })
        .eq("id", profile.id);

      if (!recentlySent) {
        await sendPush(
          pushToken,
          fwd.code
            ? (isEs ? `Código de Gmail: ${fwd.code}` : `Gmail code: ${fwd.code}`)
            : (isEs ? "Confirma el reenvío de Gmail" : "Confirm Gmail forwarding"),
          willEmail
            ? fwd.link
              ? (isEs
                ? "Te enviamos el enlace a tu Gmail. Ábrelo y toca Confirmar para activar el reenvío."
                : "We sent the link to your Gmail. Open it and tap Confirm to turn on forwarding.")
              : (isEs
                ? "Te enviamos el código a tu Gmail. Escríbelo en Gmail para activar el reenvío."
                : "We sent the code to your Gmail. Enter it in Gmail to turn on forwarding.")
            : (isEs
              ? "Ábrelo en Poquet → Estados de cuenta para activar el reenvío."
              : "Open it in Poquet → Statements to turn on forwarding."),
          { type: "gmail_forwarding_code" },
        );
        if (willEmail && await sendGmailConfirmEmail(fwd.requester!, recipient, fwd.code, fwd.link, isEs)) {
          await admin.from("profiles").update({ gmail_fwd_status: "emailed" }).eq("id", profile.id);
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

    // A real statement just came through this forwarding alias — proof Gmail's
    // forwarding is active, so the "confirm forwarding" nag can go away.
    if (profile.gmail_fwd_code || profile.gmail_fwd_link || profile.gmail_fwd_status) {
      await admin
        .from("profiles")
        .update({ gmail_fwd_code: null, gmail_fwd_link: null, gmail_fwd_at: null, gmail_fwd_status: null })
        .eq("id", profile.id);
    }
  }

  return new Response("ok", { status: 200 });
});
