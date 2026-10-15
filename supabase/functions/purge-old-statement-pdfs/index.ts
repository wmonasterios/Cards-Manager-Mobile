// purge-old-statement-pdfs: deletes statement PDFs older than RETENTION_DAYS
// (privacy policy: originals are kept 90 days, extracted data is kept).
//
// Called once a day by pg_cron (see migration 20261014_purge_old_statement_pdfs.sql).
// Deployed with verify_jwt = false; instead it requires the `x-cron-secret`
// header to match the `cron_secret` in Vault (checked through the
// service-role-only RPC `check_cron_secret`). Only the file and `storage_path` go away;
// the statement row, its transactions and `file_hash` (duplicate detection)
// stay. `pdf_purged_at` lets the app explain why the file is gone.
//
// Body (optional JSON): { "dryRun": true } lists what would be deleted.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RETENTION_DAYS = 90;
const BATCH = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const provided = req.headers.get("x-cron-secret") ?? "";
  const { data: ok, error: authErr } = provided
    ? await admin.rpc("check_cron_secret", { p_secret: provided })
    : { data: false, error: null };
  if (authErr || ok !== true) return json({ error: "unauthorized" }, 401);

  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dryRun === true;
  } catch {
    // no body: real run
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let purged = 0;
  const failures: string[] = [];
  const preview: { id: string; received_at: string }[] = [];

  // Never touch a file that is being re-read right now.
  for (;;) {
    const { data: rows, error } = await admin
      .from("statements")
      .select("id, storage_path, received_at, reread_status")
      .not("storage_path", "is", null)
      .lt("received_at", cutoff)
      .or("reread_status.is.null,reread_status.neq.reading")
      .order("received_at", { ascending: true })
      .limit(BATCH);
    if (error) return json({ error: error.message, purged }, 500);
    if (!rows || rows.length === 0) break;

    if (dryRun) {
      for (const r of rows) preview.push({ id: r.id, received_at: r.received_at });
      break;
    }

    const paths = rows.map((r) => r.storage_path as string);
    const { error: rmErr } = await admin.storage.from("statements").remove(paths);
    if (rmErr) {
      failures.push(rmErr.message);
      break; // don't loop forever on the same rows
    }

    const ids = rows.map((r) => r.id);
    const { error: upErr } = await admin
      .from("statements")
      .update({ storage_path: null, pdf_purged_at: new Date().toISOString() })
      .in("id", ids);
    if (upErr) {
      failures.push(upErr.message);
      break;
    }
    purged += ids.length;
    if (rows.length < BATCH) break;
  }

  return json({ dryRun, cutoff, retentionDays: RETENTION_DAYS, purged, wouldPurge: dryRun ? preview : undefined, failures });
});
