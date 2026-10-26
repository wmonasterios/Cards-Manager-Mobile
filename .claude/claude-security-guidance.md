# Poquet security rules

Poquet is an Expo (React Native) credit-card tracker backed by one Supabase
project (`glteomfpqyguzctdopsp`) shared by dev, preview and production — every
change touches real user financial data. Edge functions live in
`supabase/functions/`, migrations in `supabase/migrations/`.

## Per-user data isolation (highest priority)

- Edge functions that act for a signed-in user build a client with the anon key
  plus the caller's `Authorization` header, resolve the user with
  `auth.getUser()`, and scope every read/write with `.eq("user_id", user.id)`
  (see `apply-statement`, `advisor-chat`). A user id, card id or statement id
  taken from the request body must never be trusted without that check.
- The service-role client (`SUPABASE_SERVICE_ROLE_KEY`, named `admin`) bypasses
  RLS. Any query through it must filter by the authenticated user's id, or be a
  deliberate server-only job (cron). Flag service-role queries keyed only on
  request-supplied ids.
- `advisor-chat` tools (`TOOLS` / `runTool`) receive arguments chosen by the
  model, which reads user-controlled text (statement lines, merchant names,
  chat). Tool arguments must never select another user's rows; the user id comes
  from the session, never from tool input.
- Every new per-user table needs RLS enabled with policies on `auth.uid()`, and
  an `ON DELETE CASCADE` FK to `auth.users` so account deletion leaves no
  orphans.
- `profiles.plan`, `plan_until` and `plan_source` are server-only, protected by
  the `guard_profile_plan` trigger. Any change that lets a user write these
  (new policy, new RPC, weakened trigger) is a privilege escalation to Pro.

## SECURITY DEFINER functions

- Must set `search_path` (`''` or `public`), and must either check
  `auth.uid()` against the row owner or be revoked from `public, anon,
  authenticated` and granted only to `service_role`
  (pattern: `20261014_lock_down_definer_functions.sql`).
- New definer functions without an explicit `revoke execute ... from public,
  anon` are a finding.

## Edge function auth

- `verify_jwt: true`: `advisor-chat`, `delete-account`, `parse-statement`,
  `apply-statement`.
- `verify_jwt: false` by design:
  - `receive-statement-email` — called by Mailgun. Expected, not a finding.
    `senderLooksAuthentic` deliberately fails open when SPF/DKIM headers are
    absent (owner's tradeoff; forwarding tokens are unguessable). Do not flag
    that by itself, but do flag anything that lets mail to one user's
    `u-<token>@stmts.poquetapp.com` address affect another user's data.
  - `purge-old-statement-pdfs`, `push-journey` — cron jobs. They must reject
    the request unless `x-cron-secret` passes the service-role-only RPC
    `check_cron_secret` (secret in Vault). A new cron-style function without
    this check, or one that skips it on some path, is a finding.

## Secrets and keys

- `google-services.json` (Firebase client config, Android key restricted to
  `com.poquet` + SHA-1s) is committed on purpose. Not a finding.
- Supabase URL and anon/publishable key in the app are public by design.
- The service-role key, `ANTHROPIC_API_KEY`, Mailgun keys and `cron_secret`
  must only exist as Supabase secrets / Vault. Any of them in app code
  (`src/`, `App.tsx`), `EXPO_PUBLIC_*` vars, `app.json`/`eas.json`, logs or
  error messages returned to the client is critical — the app bundle is public.

## Statement PDFs and storage

- Statement PDFs are bank statements: the `statements` bucket must stay
  private and paths must be scoped to the owning user. Access goes through
  signed URLs or the user's own session, never public URLs.
- PDFs are deleted after 90 days through the Storage API; `file_hash`,
  statement rows and transactions remain. Do not log PDF contents or parsed
  statement text.

## Untrusted input to the LLM

- `parse-statement` and `receive-statement-email` send PDFs (attacker-
  controllable for the email path) to Claude. Model output is untrusted: it must
  be validated against the expected schema before being written, and must never
  be used to choose which user/card/statement to write to.
- Merchant names and statement text are user-controlled and flow into the
  advisor prompt; treat them as data, never as instructions or SQL.

## Push notifications and deep links

- Push payloads (`type`, `screen`, `cardId`, `logId`) are routed by the app on
  tap. Routing must only open known screens, and the target screen must still
  load data through the user's own session (a `cardId` in a push grants
  nothing). Lock-screen copy must not contain amounts or balances.
- `mark_push_opened(logId)` must only update the caller's own `push_log` row.

## Device lock (PIN / Face ID)

- The PIN (`src/pin.ts`) is salted + SHA-256 hashed and stored only in
  `expo-secure-store`. It must never be sent to the server, logged, or stored
  in AsyncStorage. Keep the 5-attempt / 30s lockout. `LockGate` must not gain a
  path that unlocks without a successful biometric or PIN check when either is
  configured.

## Auth flows

- Never show raw Supabase `error.message` to users (`friendlyAuthError`), and
  never reveal whether an email has an account beyond what Supabase already
  does.
- Password reset is an OTP code flow (`verifyOtp` type `recovery`); do not
  replace it with a flow that accepts the code without verifying it server-side.

## Not findings

- `__DEV__`-gated demo/stress data (`src/worstCase.ts`, `?data=` on web,
  `EXPO_PUBLIC_DEMO_DATA`) — never ships in OTA/store bundles.
- The review account `wmonasterios+applereview@gmail.com` with
  `plan_source = 'review'` — intentional for App Store / Play review.
