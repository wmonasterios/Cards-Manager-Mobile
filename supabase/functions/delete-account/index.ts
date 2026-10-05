// delete-account: permanently deletes the calling user's account and all of
// their data (in-app account deletion, required by App Store guideline
// 5.1.1(v)). Called from Settings → "Delete my account".
//
// Deployed with verify_jwt = true. The user is identified only from their own
// access token, so a caller can never delete anyone but themselves. Data is
// removed with the service role (bypasses RLS), then the auth user itself.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

// Children before parents, so foreign keys never block a delete.
const USER_TABLES = [
  "merchant_suggestion_feedback",
  "user_merchant_overrides",
  "transactions",
  "payments",
  "card_aliases",
  "statements",
  "cards",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const uid = userData?.user?.id;
  if (userErr || !uid) return json({ error: "unauthorized" }, 401);

  try {
    // 1. Statement PDFs in storage live at `${uid}/<file>`. List in pages and
    //    remove; also include any path recorded on a statement row, in case
    //    one was stored elsewhere.
    const paths = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from("statements").list(uid, { limit: 1000, offset });
      if (error) throw error;
      for (const f of data ?? []) if (f.name) paths.add(`${uid}/${f.name}`);
      if (!data || data.length < 1000) break;
    }
    const { data: stmts } = await admin.from("statements").select("storage_path").eq("user_id", uid);
    for (const s of stmts ?? []) if (s.storage_path) paths.add(s.storage_path);
    const all = [...paths];
    for (let i = 0; i < all.length; i += 100) {
      const { error } = await admin.storage.from("statements").remove(all.slice(i, i + 100));
      if (error) throw error;
    }

    // 2. Rows in every user-owned table, then the profile.
    for (const table of USER_TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", uid);
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    const { error: profErr } = await admin.from("profiles").delete().eq("id", uid);
    if (profErr) throw new Error(`profiles: ${profErr.message}`);

    // 3. The login itself (email/password, Google or Apple identity).
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw delErr;

    console.log(JSON.stringify({ event: "account_deleted", files: all.length }));
    return json({ ok: true });
  } catch (e) {
    console.error(JSON.stringify({ event: "account_delete_failed", error: String((e as Error)?.message ?? e) }));
    return json({ error: "delete_failed" }, 500);
  }
});
