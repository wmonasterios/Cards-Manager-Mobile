# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Release workflow

Full detail in `DEPLOY.md` — the short version so it's never forgotten:

- Two EAS Update channels: `preview` (auto-publishes on every push to
  `main`) and `production` (only on a `vX.Y.Z` git tag push, or manual
  workflow_dispatch). A normal JS/UI/logic change just needs a push to
  `main` — never run `eas build` for that.
- `app.config.js` wraps `app.json` and gives the `development`/`preview`
  build profiles (`APP_VARIANT=preview` in `eas.json`) their own bundle id
  (`com.poquet.preview`) and name, so a preview build installs as a
  separate app ("Poquet Preview") instead of overwriting the real one on
  the same device. This exists because both profiles originally shared
  `com.poquet`, and installing a TestFlight build silently replaced
  whatever preview build was already on the owner's phone, breaking the
  "just close/reopen to see the latest push" loop. Edit `app.json` for any
  config change, not `app.config.js` — the latter only branches identity
  by variant.
- Only run `eas build --profile production` + `eas submit` again when
  something **native** changes: a new native module/plugin, a new
  permission, the app icon, or a version bump that needs a new binary.
  Everything else ships OTA to testers automatically, including the
  friends & family TestFlight build.
- One Supabase project (`glteomfpqyguzctdopsp`) backs everything — local
  dev, the `preview` channel, and the `production`/TestFlight build all
  share it. This is deliberate, not a TODO: there's no staging/prod split,
  friends & family's real usage just becomes real production data with
  nothing to migrate later.
- iOS bundle id `com.poquet`, Apple team = Bite Panama, S.A. (org account,
  `admin@bitelatam.com`). First TestFlight build shipped ~Oct 2026.
- Public contact address is `support@poquetapp.com` (ImprovMX forwarding
  on the `poquetapp.com` root domain → the owner's gmail). This is
  completely separate from `stmts.poquetapp.com`, which is Mailgun-routed
  for the statement-forward-by-email feature (`receive-statement-email`
  edge function) — never touch one's DNS/routing while working on the
  other.
- Anthropic API billing (used by `parse-statement` and `apply-statement`'s
  merchant classifier) has auto-reload on (tops up to $15 below $5) and a
  $50/month spend limit with an email alert at $20. If testers multiply,
  revisit these numbers before they become a real constraint.
- **A new native module imported from an always-mounted component can crash
  OTA, not just "not work."** `expo-secure-store` (added Oct 2026 for the PIN
  lock) resolves its native binding at JS-*import* time
  (`requireNativeModule(...)` runs as soon as the file is evaluated, not when
  a function is first called) — and `src/pin.ts` is imported by `LockGate`,
  which every screen mounts under. Shipping that import via OTA to a device
  whose binary predates the native module would hard-crash the app on next
  launch, before any try/catch in the JS even runs. Unlike `expo-splash-screen`
  earlier in this project (whose JS degrades fine if unlinked), this class of
  dependency needs its `eas build` to land *before or together with* the OTA
  that starts importing it — never push the JS to `main` first and build
  "soon after." When adding a native dependency, check whether anything on
  the always-mounted path (`App.tsx`, `LockGate`, `NotificationsSync`, etc.)
  imports it, not just whether a screen you can navigate away from does.
- `google-services.json` (Firebase, project `poquet-357ab` under
  `admin@bitelatam.com`) is checked into the repo — expected, Firebase client
  keys are meant to ship in code/binaries, GitHub's secret-scanning alert on
  it is a false-positive-by-design. **But** the underlying API key
  (`AIzaSyCw4u5...PNeo`, in Google Cloud Console → APIs & Services →
  Credentials, under the `poquet-357ab` *Firebase* project — not the same as
  any Google Cloud project with a similar name under this account) currently
  has **no Android app restriction** ("Application restrictions: Ninguno").
  Restricting it needs a package name + SHA-1 pair, and no Android build has
  happened yet in this project (iOS-only so far), so there's no signing
  keystore to get a SHA-1 from. **TODO once the first `eas build --platform
  android` runs**: get the SHA-1 via `eas credentials`, go back to that API
  key, set "Application restrictions" → "Apps para Android", add
  `com.poquet` (and `com.poquet.preview`) with their SHA-1s.

# Security: PIN + Face ID (Oct 2026)

Password signup now requires 8+ characters (client-side only — Supabase's own
"Confirm email" stays off, deliberately, for a low-friction signup funnel).
Right after a brand-new account finishes signup, `SecuritySetupScreen` offers
Face ID (if the device has it enrolled) with a PIN as its always-available
fallback, or goes straight to PIN setup on a device with no biometrics. This
is reachable only from `AuthScreen`'s signup path (`finishSignup`), not from
sign-in or from Google/Apple OAuth — there's no reliable "this was a brand
new account" signal for OAuth, so those still go straight to `finish()`.

- `src/pin.ts`: a 6-digit PIN, salted + SHA-256 hashed via `expo-crypto`,
  stored in `expo-secure-store` (Keychain/Keystore) — never sent to the
  server, never recoverable, this is a device-unlock check, not an account
  credential. 5 wrong attempts triggers a 30s lockout.
- `LockGate` now locks whenever **either** `faceLock` is on **or** a PIN is
  set (previously: `faceLock` alone) — a PIN-only device had no lock screen
  at all before this. Biometric failure/unavailability falls back to PIN
  entry instead of the old silent auto-unlock, but only when a PIN actually
  exists; with neither method available it still never permanently locks
  someone out of their own data.
- Settings → "Set/Change/Remove PIN" lets an existing user add one later
  without going through signup again.

# Design system ("Poquet" redesign, Oct 2026)

Landed via 4 PRs from a separate Claude session (claude.ai, not this CLI) —
reviewed and merged into this history, all green on `preview`. Know this
before touching any screen's styling:

- `src/theme/index.ts` is the single source of truth: `darkColors` ("Neón")
  and `lightColors` ("Confeti") are two *independent* palettes, not light/dark
  variants of the same hues — don't assume a token's color relationship holds
  across modes. Both share one vivid categorical palette (`VIVID`) for charts,
  categories and card art, so a given category/card looks the same regardless
  of mode.
- Design principle: **accent is reserved for controls** (solid buttons,
  toggles, selected chips, the active tab pill) — never for plain text, never
  for a border used just to mean "something's up with this row." Urgency is
  signalled via `seg1`/`seg3` (ring/chart colors) and `ink` vs `ink3` (weight),
  not via colored borders. A primary button is a solid fill (`backgroundColor:
  colors.accent`) with `color: colors.onTint2` text, not an outline.
- `fonts.display` / `fonts.displayMedium` (Bricolage Grotesque 600/500) are
  for titles and large amounts only, loaded at runtime via `expo-font` +
  `@expo-google-fonts/bricolage-grotesque` in `App.tsx`, with a system-font
  fallback if loading fails. Body text stays on the platform font — never put
  `fontWeight` on a `fonts.display*` text node, each weight is its own family.
- A card's text color is never hardcoded white — compute it per card with
  `artInk(cardId, colorKey)` from `src/data.ts` (dark text on vivid fills,
  light text on violet/slate), matching `artGradient`'s same palette lookup.
- `src/components/Mascot.tsx` has small hand-drawn SVG characters
  (`DocMascot`, `CalendarMascot`) for upload/empty states only — deliberately
  never shown next to a balance or debt figure.
- **New native dependencies**: `expo-font` (already linked — `expo` itself
  depends on it, so no new build was needed for that part) and
  `expo-splash-screen` (genuinely new — it's a config plugin that writes
  native launch-screen resources, invisible to OTA). The new app icon
  (`assets/icon.png` etc.) is likewise a native-build-time asset. **Practical
  effect**: everything color/typography/layout is already live on `preview`
  via OTA, but the new icon and splash screen won't appear on any
  already-installed build (including the TestFlight one friends have) until
  the next `eas build --profile production` + `eas submit`.

# Edge functions: versioning is now mixed (Oct 2026)

`supabase/functions/receive-statement-email/index.ts` is now checked into
this repo and matches the deployed v10 exactly (verified byte-for-byte).
`supabase/functions/delete-account/index.ts` (in-app account deletion,
Settings → "Delete my account", required by App Store guideline 5.1.1(v))
is also in the repo, deployed with `verify_jwt: true` — unlike
`receive-statement-email`, which is `verify_jwt: false` since Mailgun calls it.
Every user-owned table also has an `ON DELETE CASCADE` FK to `auth.users`;
keep that true for any new per-user table so deleting the auth user can never
leave orphans. `apply-statement` and `parse-statement` are **not** in the repo yet — they
still only exist in Supabase itself, edited directly via the Supabase MCP
tools (`get_edge_function`/`deploy_edge_function`), same as earlier in this
project's history. Before editing any edge function: check whether its
source is under `supabase/functions/` first. If it is, edit it there,
commit, and redeploy via `deploy_edge_function` with that file's new
content (committing alone does **not** deploy — there's no CI step for
edge functions, unlike the app's own OTA publish). If it isn't in the repo,
fetch the live source via MCP first as before.

`receive-statement-email` also gained Gmail forwarding-confirmation
handling: Gmail won't start forwarding to a user's `u-<token>@stmts.
poquetapp.com` address until confirmed, and sends that confirmation (a
numeric code on older flows, a link on current ones) to that same address
— which, before this, the function silently treated as "no PDF" and
dropped. It now recognizes mail from `forwarding-noreply@google.com`,
saves the code/link to `profiles.gmail_fwd_*` (7-day display window,
client-side in `getGmailForwardingCode`), pushes the user, and emails the
code/link back to the Gmail account that requested it (only once a
Mailgun SPF/DKIM check suggests the triggering email is genuinely from
Google — see `senderLooksAuthentic`, which fails open if those headers are
absent, a deliberate tradeoff favoring not breaking the real flow over
hardening a low-severity edge case, since forwarding tokens aren't
guessable). Shown in Statements as a card with a "Confirm in Gmail" button
(link flow) or a copyable code (older flow).
