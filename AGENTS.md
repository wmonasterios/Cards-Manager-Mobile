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
- Anthropic API: since 12 Oct 2026 the `ANTHROPIC_API_KEY` secret (used by
  `parse-statement`, `receive-statement-email`, `apply-statement`'s merchant
  classifier and `advisor-chat`) is a key from the **Bite Panama, S.A.**
  organization in the Claude Console (`admin@bitelatam.com`), linked to the
  `poquet-backend` service account (Developer role, Default workspace scope,
  no expiry) — not the owner's personal console account any more. Billing:
  auto-reload, $50/month spend limit, email alert at $20. If testers
  multiply, revisit these numbers before they become a real constraint.
  Zero Data Retention was **declined by Anthropic sales on 20 Oct 2026**
  (enterprise-only), so the standard API retention applies: inputs/outputs
  deleted within 30 days (longer only for usage-policy flags or legal
  holds), no training on commercial data. poquetapp.com's privacy page states
  this. We only use the Messages API (PDFs inline as base64, no Files/Batch
  API), so nothing is stored there on purpose.
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
- **`runtimeVersion.policy` in `app.json` is `"appVersion"`** — every build
  sharing the same `version` string shares the same OTA runtime bucket, so
  *all* of them get the *same* updates, even ones that need a native module
  an older build doesn't have. This is what actually broke builds 2 and 5 in
  Oct 2026: the PIN's `expo-secure-store` OTA shipped to the `production`
  channel while builds 2, 5 and 7 were all still `1.1.0`, so 2 and 5 (built
  before that dependency existed) had to be expired in TestFlight — bumping
  `version` after the fact doesn't retroactively protect builds already out
  there. **Before publishing any OTA to `production`, check that every
  currently-active build has the native modules the JS being shipped needs.**
  Going forward, bump `version` in `app.json` (e.g. 1.1.0 → 1.2.0) on any
  build that adds a native module, so older builds fall into a different
  runtime bucket and simply stop receiving updates that would crash them,
  instead of silently sharing a bucket with builds that can't run them.
- `google-services.json` (Firebase, project `poquet-357ab` under
  `admin@bitelatam.com`) is checked into the repo — expected, Firebase client
  keys are meant to ship in code/binaries, GitHub's secret-scanning alert on
  it is a false-positive-by-design. The underlying API key
  (`AIzaSyCw4u5...PNeo`, "Android key (auto created by Firebase)" in Google
  Cloud Console → APIs & Services → Credentials, under the `poquet-357ab`
  *Firebase* project — not the same as any Google Cloud project with a
  similar name under this account) was restricted on 11 Oct 2026 to
  "Apps para Android" with package `com.poquet` and two SHA-1s: the upload
  key (EAS keystore, `53:47:26:8E:…:0C:08`, same one Play Console shows as
  the upload certificate) and the Play app signing key
  (`B5:F1:9A:F3:…:F9:DE`). The key only appears in `google-services.json`
  (Android), so this doesn't affect iOS. **TODO when a `preview` Android
  build exists**: add `com.poquet.preview` with that build's SHA-1 (it has
  none yet — adding it without one would make the key reject that variant).
  If Play ever rotates the app signing key (Play Console → Protegida con
  Play → Gestiona la firma de aplicaciones de Play; a previous key from 5 Oct
  2026 is listed with 0% installs), add the new SHA-1 too. The separate
  "Browser key" is unrestricted by app (API-limited only); the app doesn't
  use it.
- **Android status (10 Oct 2026).** Play Console (org account Bite Panama,
  S.A., app `com.poquet`) is set up: forms, store listing (es-419) and
  category done. First build shipped (`eas build --platform android
  --profile production`, versionCode 2, version 1.1.0, AAB). Internal test is
  active; **open test** was approved on 8 Oct (submission 1) and the track was
  resumed (it starts paused). Public join link, used by poquetapp.com's
  `ANDROID_TEST_URL`: `https://play.google.com/apps/testing/com.poquet`.
  Open issue: the link showed "App not available" on a real Android with the
  open test limited to Panama (suspect: the Google account's Play country).
  On 10 Oct all countries were added and re-sent for review; once it says
  "Published", retest on a real device. If it still fails, build versionCode 3
  and upload it to open test only (version 2 also sits in internal test and
  shows "Superseded" in open test). Still pending: checking biometrics and
  Apple sign-in on a real Android device.
- **Android and iOS share one OTA channel.** `eas update --branch production`
  publishes for both platforms, and every build is `1.1.0`, so one production
  OTA reaches TestFlight and Play at once. The `production` workflow can be
  triggered by a `vX.Y.Z` tag or by `workflow_dispatch`; last run 14 Oct
  (3e51701, workflow_dispatch: advisor on for everyone + password eye)
  caught Play and TestFlight up with `main`; then again 14 Oct (f353bc9,
  workflow_dispatch: 90-day PDF retention + definer-function lockdown); then
  15 Oct (7aef979, run 38832284232: demo advisor + richer demo, Spanish
  dates/categories, Insights redesign); then 16 Oct (e120e3e, run
  38932834199: dedupe payment reminders, localized reminder text — reminders
  are now cancelled by scanning the OS queue for `data.type ===
  'payment_reminder'` and runs are serialized, because overlapping runs had
  orphaned dozens of identical reminders); then 18 Oct (c59a0c4, run
  39187461437: large amounts single-line with `adjustsFontSizeToFit` and
  `maxFontSizeMultiplier={1.3}` — the Home total wrapped on a Galaxy S23
  Ultra; language now follows the device via `Intl` and only an explicit
  Settings pick is persisted, under `langChoice` — the old `lang` key also
  saved a wrong auto-detected 'en' on Android, so it's ignored now); then 20 Oct (dfa0a7e, run
  39530013442: multi-currency phase 1 — per-currency totals on Home,
  Transactions and Calendar, Insights currency selector, card currency on Pay
  and card detail; also shipped the push-journey tap tracking and break-ui
  fixes that were only on `preview`); then 20 Oct night (5d8479f, run 39546282129:
  apply OTA at launch, important-update banner + `app_config`, reload screen
  with the launch logo, session refresh on foreground + retry before the
  cards error; the Colpatria reading fixes are backend-only, already live); then 23 Oct
  (33e41c8, run 40018808271: real app version in About, real support
  reports, always-ask update banner with spring motion, additional cards —
  per-line card number, card_members picker, card-detail section,
  who-filters in Insights/Transactions; owner's ConnectMiles/Rey statements
  backfilled with card_last4, 1730/3137 marked principal). No native module changes since
  a270c47. `ios.supportsTablet` is now false (iPhone only, 15 Oct): native,
  takes effect with the next `eas build` for the App Store submission.
- **App Store submission (15 Oct 2026).** Build 8 (1.1.0, iPhone only, new
  icon/splash) submitted for App Store review, manual release. Listing name
  "Poquet: Credit Card Tracker" / "Poquet: Tarjetas de crédito"; primary
  language English (U.S.) with Spanish (Mexico); age rating overridden to
  18+ (Terms require 18); China mainland, Mac and Vision Pro excluded; EU
  DSA trader declared. Screenshots uploaded at 1206×2622 (ASC's "medium
  display" slot). Review account `wmonasterios+applereview@gmail.com` has
  sample data, plan `pro` (`plan_source = 'review'`) and no advisor consent
  on purpose. Full answers: Drive kit `06-Textos/03`.
- **Google Play production submission (17 Oct 2026).** versionCode 3 (1.1.0,
  new icon/splash) sent to production review (submission 3) with managed
  publishing ON — approval doesn't auto-publish; the owner presses Publish.
  178 countries, listing es-419 + en-US, Data safety updated to 9 data
  types (all collected, none shared, App functionality), login credentials
  = the same Apple review account. **Published 18 Oct 2026** — live at
  `https://play.google.com/store/apps/details?id=com.poquet`; poquet-web's
  `ANDROID_TEST_URL` and `public/llms.txt` now point there (poquet-web
  e1bb9e9). Open-test users get versionCode 3 too (Play serves the highest
  versionCode across a user's tracks). versionCode 2 likely predates
  `expo-secure-store` (8 Oct), so it can't apply current OTAs and falls back
  to its embedded bundle — anyone still on it must update from the store.
- **TODO 1.2.0: enable R8 minification for Android release builds**
  (`expo-build-properties`, `android.enableMinifyInReleaseBuilds`) — Play
  flags "DEX optimization below threshold" (obfuscation 1%), deadline Feb
  2027. Native: needs a new build; test sign-in, push and PDF upload after
  enabling it, since R8 can strip classes reflection-based libraries need.

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

**Forgot password (Oct 2026)** is a code flow, not a link: `requestPasswordReset`
(`resetPasswordForEmail`) → user types the code → `resetPasswordWithCode`
(`verifyOtp` type `recovery`, then `updateUser`). It only works if Supabase →
Authentication → Emails → **Reset Password** template includes `{{ .Token }}`.
Supabase Auth errors are shown through `src/authErrors.ts` (`friendlyAuthError`)
— never show `error.message` raw, it's always English.

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
  **Deliberate exception (owner's call, Oct 2026):** the Statements screen's
  two "add a statement" option cards use `accent` on the 1/2 number circles,
  the a/b step letters, the card icons, the "See how" tip link and the
  "Add a card manually" link — to make the two ways in read as a guided
  choice. Don't "fix" this back to neutral ink; keep it scoped to that block.
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

**Design/motion skills (19 Oct 2026).** `.claude/skills/` holds five skills
copied from `emilkowalski/skills` (MIT, commit 2d22863, Markdown only):
`animate-expo`, `break-ui`, `find-animation-opportunities`,
`review-animations`, `apple-design`. They're one author's taste, so the
rules above win on any conflict (accent only on controls, `artInk` for card
text, mascots never next to money, `fonts.display*` without `fontWeight`).
`apple-design` and the two animation-review skills are written for the web —
take the principles, not the CSS. `animate-expo` assumes
`react-native-reanimated` 4 + `react-native-worklets`,
`react-native-gesture-handler` and `expo-haptics`, **none of which this app
has yet**. All are native: add them together in one planned `eas build` with
a `version` bump (see the OTA rules at the top), never as a side effect of a
UI tweak. Until then, motion stays on what's already linked (core `Animated`).
Owner's call: no new animations before the 1.3 build.

**Worst-case data (dev only).** `src/worstCase.ts` swaps the demo catalogue
for stress data built from real DB limits (65-char merchants, US$ 17,500
charges, 6 cards, 194 lines in a month) when the app runs in dev with
`?data=worst|empty|one` on web (`npx expo start --web`) or
`EXPO_PUBLIC_DEMO_DATA` set; then enter the demo. Gated by `__DEV__`, so it
never reaches an OTA or store bundle. Re-run it after touching any list,
card face or amount layout.

# Edge functions: versioning is now mixed (Oct 2026)

`supabase/functions/receive-statement-email/index.ts` is now checked into
this repo (deployed v17 on 20 Oct 2026, together with `parse-statement` v17
and `advisor-chat` v12: Latin America prompt, `1.250.000,00`-style amounts,
advisor tools split `by_currency` for users with more than one currency). Both `parse-statement` and this function's
in-process parse read `previous_balance` and, when the lines don't
reconcile, re-read once with the gap and keep the closer reading — keep the
two copies of the prompt/schema/self-check in sync.
`supabase/functions/delete-account/index.ts` (in-app account deletion,
Settings → "Delete my account", required by App Store guideline 5.1.1(v))
is also in the repo, deployed with `verify_jwt: true` — unlike
`receive-statement-email`, which is `verify_jwt: false` since Mailgun calls it.
Every user-owned table also has an `ON DELETE CASCADE` FK to `auth.users`;
keep that true for any new per-user table so deleting the auth user can never
leave orphans. `apply-statement` and `parse-statement` are in the repo too since 12 Oct
2026 (fetched from the live versions, then edited). Every edge function is
now under `supabase/functions/`: edit it there, commit, and redeploy via
`deploy_edge_function` with that file's new content (committing alone does
**not** deploy — there's no CI step for edge functions, unlike the app's own
OTA publish).

`apply-statement` drops incoming lines the card already has before
inserting: same date and amount, and a merchant equal once normalized (no
accents, letters/digits only, shared prefix — statements truncate names).
`dedup_key` alone wasn't enough: the same statement read twice (uploaded,
then forwarded by email) can come back as "Grand Deli Gourmet OBA Panamá"
one time and "GRAND DELI GOURMET OBA PANAM" the next. Within a single
statement, repeated identical lines (same day, merchant, amount) are real
separate charges — statement totals only reconcile with all of them — so
repeats get `dedup_key` suffixes `#2`, `#3`… instead of being collapsed. A
second statement for the same card + cutoff is dropped (copy and PDF
deleted) and the user is told "Ya lo tenías". Useful audit: per card,
`balance(n) = balance(n-1) - sum(parsed amounts)` should hold to the cent.

**Statement detail (Oct 2026):** tapping an applied statement in the
history opens `StatementDetailScreen`. History rows and the detail show the
balance check from `src/statementCheck.ts` ("Cuadra" / "No cuadra por US$ x",
nothing for a card's first statement). "Volver a leer" runs in the
**background**: `startReread` calls parse-statement with `reread: true`, which
answers 202 at once, keeps reading via `EdgeRuntime.waitUntil`, and writes the
result to `statements.reread_parsed` / `reread_status` ('reading' → 'ready' or
'failed'; migration `20261013_statement_reread.sql`) — it never touches
`parsed` or `status`, even on errors. A push (`type: reread_ready`) opens
`StatementDetail`. The screen and the history pill poll while 'reading'
(treated as lost after 6 min). The user then picks:
`applyStatement(..., { replace: true })` (old rows deleted, `manual`
categories and `excluded_from_spend` carried over by matching
date/amount/merchant) + `clearReread`, or just `clearReread`.
"Eliminar" = `deleteAppliedStatement`:
its transactions, PDF and row, and if it was the card's latest statement the
card's balance/minimum/dates roll back to the previous statement's.

`receive-statement-email` also gained Gmail forwarding-confirmation
handling: Gmail won't start forwarding to a user's `u-<token>@stmts.
poquetapp.com` address until confirmed, and sends that confirmation (a
numeric code on older flows, a link on current ones) to that same address
— which, before this, the function silently treated as "no PDF" and
dropped. It now recognizes mail whose From address is exactly
`forwarding-noreply@google.com`, saves the code/link to
`profiles.gmail_fwd_*` (7-day display window, client-side in
`getGmailForwardingCode`), pushes the user, and emails the code/link back to
the Gmail account that requested it. Shown in Statements as a card with a
"Confirm in Gmail" button (link flow) or a copyable code (older flow).

**Hardened 25 Oct 2026 (security audit).** This used to fail open (send the
email whenever SPF/DKIM headers were absent or either passed), on the
premise that forwarding tokens aren't guessable. That premise doesn't hold:
anyone can sign up, mail their *own* `u-<token>` address with a forged From,
put any victim's address in the subject and a link to e.g. `evilgoogle.com`
(the old link pattern accepted any host ending in `google.com/`), and we'd
email that victim the link from our domain. Now: the link must parse to
exactly `mail-settings.google.com` or `mail.google.com` (`isGmailConfirmHost`),
and the email back only goes out when `sentByGoogle` holds — Mailgun's SMTP
envelope `sender` is on google.com **and** `X-Mailgun-Spf` is `pass` —
failing closed otherwise. Saving + push don't depend on it (they only reach
the address's owner). The `no_pdf_mail` log line records `envelopeGoogle`
and `spf`, so if a real confirmation ever stops being emailed back, the logs
show which part failed.

# Installments ("cuotas", 15 Oct 2026)

A cuota is a **mark on a transaction, not a category**: the club paid in 24
cuotas stays Entertainment and counts once a month, in the month it's
charged. Columns (`20261015_installment_series.sql`): `plan` ("3/12"),
`plan_source` ('statement' | 'detected' | 'manual' | 'none' = the user said
"no es cuota"), `plan_group` (one uuid per series, shared with the original
purchase), `plan_original` (the purchase the user moved to cuotas — "La pasé
a cuotas" — kept with `excluded_from_spend = true` so it isn't counted twice;
its cuotas can be on another card and start months later).

- `apply-statement` (v24): fills a missing `plan` from the merchant text
  (`CUOTA:03/48`, `PLACUOTA`, `TCUOTA`) or by continuing a series on the card
  (same merchant, amount within 1% — the last cuota is often a few cents
  off), copies the series' `plan_group` and category (unless the user has an
  `override` rule), starts a new group otherwise, and joins a new series to an
  unlinked `plan_original` whose amount it adds up to (within 2%). On a
  re-read, `manual`/`none`/original marks are carried over like manual
  categories.
- App: `src/instalments.ts` (series building, suggestions, matching),
  `src/components/Instalments.tsx` (series card, "Es pago en cuotas" and "La
  pasé a cuotas" sheets), wired in `TransactionDetailScreen` through
  `patchTxs` (CardsContext → `patchTransactionRows`). `TxRow` shows a neutral
  "Cuota n/N" badge; Transactions has "Solo cuotas"; Insights shows "incluye
  US$ x en cuotas" per category (lighter bar segment) and a "Pagos en cuotas"
  section (this month, still to pay, what frees up next, active plans).
- `advisor-chat` (v11): category totals include cuotas, with
  `installments_in_category` / `installments_by_category` as the fixed part;
  budgets limit the variable part and list cuotas with their end month.
  `monthly_spending` still flags incomplete months (a card whose latest
  statement cutoff is before the month's end) — never a budget baseline.
- `interest_and_fees` (v11) nets out fee/interest reversals (not cashback
  bonuses or balance-transfer credits), counts as interest only lines that say
  interest (a bare "Financiamiento" goes to `unclear_financing`, for the
  advisor to ask about), and returns `interest_by_month` / `last_interest_month`
  so old interest isn't advised on as if ongoing.
- The owner's two financed purchases were linked by hand (Academia →
  Intra/Extra, the US$ 17,500 balance purchase → Davibank).

# 1,000-row cap (Oct 2026)

PostgREST returns at most 1,000 rows per request, and `.limit(5000)` does
**not** raise it. Anything that can read more than that — the app's
`listTransactions`, the advisor's `spendRows`/`interest_and_fees`
(`allRows`), apply-statement's dedup lookup — pages with `.range()` and a
stable order (`occurred_on`, `id`). Before this, an account with 2,017
transactions only saw the newest 1,000 (Insights started in May). Keep new
queries over `transactions` paginated.

# Plans and AI cost (freemium groundwork, 14 Oct 2026)

Owner's decision: launch free, measure 4-8 weeks, add a paid Pro (RevenueCat)
in 1.3. Groundwork in `20261014_plans_and_ai_usage.sql`:
- `plans` (free: 5 advisor questions/month and 5/day; pro: 100 and 20;
  `max_cards`/`history_months` exist but are NULL = no limit). Change limits
  by editing rows — no app build needed.
- `profiles.plan` / `plan_until` / `plan_source`, guarded by the
  `guard_profile_plan` trigger so only the server (service role / SQL editor)
  can change them — the "update own profile" policy would otherwise let a
  user make themselves Pro. `effective_plan(uid)` falls back to free when
  `plan_until` has passed. The owner is `pro` (`plan_source = 'owner'`).
- `advisor_access` is now only the on/off switch; its `monthly_limit` /
  `daily_limit` are NULL and, if set, override the plan per user.
- `ai_usage` gets one row per Claude call that reads a statement (`parse`,
  `reread`, `email_parse`; written with the service role), `model_prices`
  holds USD per million tokens (Sonnet 5 figure is from a third-party page —
  verify against Anthropic's pricing page), and the owner-only
  `user_metrics` view (no grants to anon/authenticated) shows per user:
  cards, statements, last-30-day statements, advisor questions and cost,
  reading cost. Merchant classification calls are not logged yet.

# AI advisor (MVP, Oct 2026)

**On for everyone from version 1** (owner's call, 14 Oct 2026). Access =
`plans.advisor_enabled` for the user's effective plan (the kill switch:
set it false to turn the advisor off for that plan at once), unless an
`advisor_access` row exists for that user, which overrides it either way.
Same rule in `advisor-chat` and `getAdvisorStatus`. When off, users see the
"Muy pronto" teaser (`AdvisorScreen` mode `off`); demo users get an alert.
The consent screen links to poquetapp.com's Terms and Privacy pages, which
describe the advisor (14 Oct 2026). Tables: `supabase/migrations/20261012_advisor.sql`.
Edge function `advisor-chat` is in the repo (`verify_jwt: true`) — edit it
there and redeploy via `deploy_edge_function`. App side:
`src/supabase/advisorApi.ts`, `AdvisorScreen` (consent → chat → limit) and
`AdvisorMemoryScreen`. Tools the model can call live in `TOOLS`/`runTool`
(cards, upcoming payments, spending, merchants, transactions, interest and
fees — which must keep excluding installment principal —, installment plans,
statement coverage, remember/forget).



# Statement PDF retention: 90 days (owner's call, 14 Oct 2026)

Original statement PDFs are deleted 90 days after `statements.received_at`;
the statement row, its transactions and `file_hash` (duplicate detection)
stay. The edge function `purge-old-statement-pdfs` (in the repo,
`verify_jwt: false`) does the deleting through the Storage API — Supabase
blocks deleting `storage.objects` with plain SQL — then sets `storage_path`
to NULL and `pdf_purged_at` to now. It skips statements being re-read
(`reread_status = 'reading'`) and accepts `{ "dryRun": true }`.

Auth: the `x-cron-secret` header must match Vault's `cron_secret`, checked by
the service-role-only RPC `check_cron_secret`. pg_cron calls it through
`private.invoke_purge_old_statement_pdfs(dry_run)` (pg_net). Migration:
`20261014_purge_old_statement_pdfs.sql`. Dry run from SQL:
`select private.invoke_purge_old_statement_pdfs(true);` then read the reply
in `net._http_response`.

App side: with no `storage_path`, `StatementDetailScreen` hides "Ver PDF
original" and "Volver a leer" and shows a privacy note; the statements list
shows an alert instead of trying to open a missing file.

**Daily job scheduled 14 Oct 2026** (pg_cron job `purge-old-statement-pdfs`,
`15 8 * * *` = 03:15 Panama), right after the production OTA (run
38675000994, f353bc9) that ships the purged-PDF handling. To pause it:
`select cron.unschedule('purge-old-statement-pdfs');`

The first real deletions happen ~17 Dec 2026 (oldest PDF: 17 Sep 2026).
poquetapp.com's privacy page states the 90-day rule — keep both in sync if
the period changes (`RETENTION_DAYS` in the edge function).

# Push journey (server nudges, 18 Oct 2026)

Server-sent pushes that walk a new user to the main milestones, plus monthly
reminders. Edge function `push-journey` (in the repo, `verify_jwt: false`,
auth via `x-cron-secret` + `check_cron_secret` like the PDF purge), migration
`20261018_push_journey.sql`. **Scheduled 18 Oct 2026**: pg_cron job
`push-journey`, `5 14-23,0,1 * * *` = hourly 09:05–20:05 Panama; the function
also refuses to send outside 09–20 Panama. Pause:
`select cron.unschedule('push-journey');`

- Messages (copy approved by the owner, es/en, no amounts — lock screen):
  welcome (<2 days old), no_statement_1 (+1d) / no_statement_3 (+3d) without
  a statement, advisor 💬 (+1d after the first statement, never asked),
  forwarding 📩 (+2d, no statement ever arrived by email), second_card 💳
  (one card, 5–21 days old), habit 🎉 (a card got a statement 20+ days after
  its first one, within the last 7 days — same-day backfills don't count),
  due_today (due date today, not `paid_this_cycle`), after_cutoff (cutoff +4
  to +20 days without a newer statement). Monthly ones take priority. Each
  journey step has a time window so old accounts aren't flooded.
- Limits: 1 push per ~20 h and 3 per 7 days per user. `push_log` has one row
  per send, unique per (user_id, kind, ref) — journey steps go out once,
  monthly ones once per card + date (`ref = cardId:date`). Review accounts
  (`plan_source = 'review'`) are skipped; `DeviceNotRegistered` clears the
  token.
- Opt-out: `profiles.push_reminders` (mirrors the app's "Payment reminders"
  toggle; gates due_today/after_cutoff) and `profiles.push_updates` ("New
  statement arrived"; gates journey steps), synced by `NotificationsSync`.
- Taps: the push data carries `type: 'journey'`, `screen`, `cardId`, `logId`;
  the app routes the tap and calls `mark_push_opened(logId)`, which sets
  `push_log.opened_at` (tap rate per kind).
- Editing copy: it lives in `COPY` in the edge function — edit, commit,
  redeploy; no app update. Already-sent steps are not re-sent.
- Testing: POST with `{ "dryRun": true, "ignoreHours": true }` (optionally
  `"onlyUser": "<uuid>"`) via `net.http_post` with the Vault `cron_secret`,
  then read `net._http_response`.
- The local 3-day-before reminder (`src/notifications.ts`) no longer shows
  amounts either.
- Next (not built): owner-only manual/mass send page; metrics panel per
  milestone; email (separate sending subdomain, unsubscribe link).

# OTA delivery: always ask, never apply behind the user's back (22 Oct 2026)

History: on 20 Oct an at-launch auto-apply (`src/launchUpdate.ts`: check +
fetch for 3 s, then `reloadAsync`) plus a banner only for updates flagged in
`app_config.important_update_after` were added. In practice the at-launch
reload never ran when iOS resumed the app from the background (not a
launch), so the owner still had to force-close; and a launch-logo reload
felt like the app had closed. **Owner's call (22 Oct): replaced both.**

- `src/launchUpdate.ts` is gone; the app always opens straight away with
  the bundle it has.
- `src/components/UpdateBanner.tsx` looks for an update every time the app
  is opened — cold start (expo-updates' own on-load check, plus a backup
  check 5 s in) and every return from the background (at most one request
  per 30 s) — downloads it, and shows "Hay una versión más reciente de
  Poquet · Actualizar / Ahora no" for **any** downloaded update, only on
  Home/Calendar/Insights/Settings. "Ahora no" lasts until the app is next
  opened; an update never accepted still applies on the next cold start.
- "Actualizar" = `reloadAsync` with the native reload screen: theme
  background, a medium spinner and an image reading "Actualizando Poquet…" /
  "Updating Poquet…" (`assets/2026-10-22-updating-{es,en}-{dark,light}.png`,
  280×120 pt drawn at 3x in Bricolage 500, transparent middle so the centred
  spinner sits above the centred text — the reload screen can't render text
  itself). Regenerate them if the copy or `ink2` changes.
- Motion (owner's call, 22 Oct — the one exception to "no new animations
  before 1.3", done with core `Animated`, no native module): the banner
  enters from 24 px below with a fade and a soft spring (stiffness 260,
  damping 18 ≈ 3 px overshoot, ~0.4 s); "Ahora no" slides it down and fades
  it (~0.2 s). "Reduce Motion" on = fade only.
- `public.app_config.important_update_after` (migration
  `20261021_app_config.sql`) is no longer read by the app; the table stays.
- A phone only gets this once it's running a bundle with this code (one
  last force-close on old bundles).

# Support reports (22 Oct 2026)

"Reportar un error" is real now (it used to be a prototype alert with a fake
ticket number). Entry points: Settings → Soporte (general), the statement
review screen ("¿Algo se leyó mal y no puedes corregirlo? Avísanos") and the
statement detail ("¿Algo se leyó mal? Avísanos") — the last two pass that
statement's id, default the area to PDF reading and the "let us look at this
statement" switch to on. Edge function `submit-report` (in the repo,
`verify_jwt: true`) saves to `public.support_reports` (migration
`20261022_support_reports.sql`; written only with the service role, users
can read their own) and emails support@poquetapp.com through Mailgun's
`stmts.poquetapp.com` domain with Reply-To = the user. The email carries the
statement (bank ·· last4, cutoff, status, whether the PDF still exists, id)
only when the user allowed it, plus app version/OTA/device from
`src/appVersion.ts`. 10 reports per user per day. Triage:
`select * from support_reports where status = 'new' order by created_at desc;`
then set `status` to 'seen' / 'fixed' / 'wontfix'.

The old "Corregir lectura" (`FixScreen`, a mock that "saved a rule for Banco
General") is no longer linked from Settings: with AI reading there are no
per-bank rules to save. "Volver a leer" covers a one-off misread; a bank
misread every time is fixed in the prompt/apply-statement after a report.

# Additional cards (22 Oct 2026)

A statement can hold several card numbers (main card, additional cards, an
old number that was renewed — e.g. the owner's BAC: 9052 old/account, 6464
his, 4546 his wife's). The readers (`parse-statement` v19,
`receive-statement-email` v19 — keep both prompts/schemas identical) tag every
line with `card_last4` (the number of the section it's printed under) and list
`cards`; `max_tokens` went to 32000 for the extra output. Banks place the
card number either as a header above its lines (BAC) or only in a subtotal
line at the end of its block ("SUB TOTAL TARJETA: ****0211", Davivienda);
the prompt names both layouts (`parse-statement` v20,
`receive-statement-email` v20, 23 Oct). `apply-statement`
(v26) stores `transactions.card_last4` and upserts the user's answers into
`card_members` (migration `20261023_card_members.sql`: card_id, last4, kind
'principal'|'additional', name the USER typed — never the printed name).

Owner's rule: everything that isn't an additional card's is the principal's.
A number with no row = principal; a 'principal' row only records the user
already answered. Fees, payments, transfers and taxes are always the
principal's even inside an additional's section (`ACCOUNT_CATEGORIES` in
`src/supabase/cardsApi.ts` and in `advisor-chat`). The card's balance,
minimum and dates stay the whole account's.

- Review screen and "Volver a leer": `CardMembersPicker` asks once per new
  number when a statement has 2+ numbers (default Principal).
- Card detail: `CardAdditionals` above "Registrar un pago" — latest statement's
  spend per additional, % of the statement, "Ver las compras de X" →
  Transactions `{ cardId, member: last4 }`; "Gestionar" sheet to change it.
- `Transaction.member` (name) → tag in `TxRow`, row in transaction detail.
- Filters by person (owner's design, 23 Oct): **Insights** = month → a
  full-width, label-less "Todos · Principal · <names…>" track (scrolls
  sideways with many names) → the card filter, which then only lists the
  cards where the chosen holder is an additional ("Principal"/"Todos" keep
  all cards). **Transactions** keeps it low-key: a fold-out "ADICIONALES"
  row (chips) above "TARJETA", same narrowing logic. Collapsed filter rows
  show an accent pill with the chosen value, grey "Todas/Todos" otherwise.
  Both hidden for users without additional cards. The period segment says
  "3 meses" (was "Últimos 3 meses", which wrapped); `Segmented` shrinks
  labels instead of wrapping.
- `advisor-chat` v13: `who` param on spending tools, `by_holder` in
  spending_by_category, `additional_cards` in cards_overview.
- Lines read before this have no `card_last4` (count as principal) until the
  statement is re-read.

**Full line value (23 Oct 2026, `parse-statement` v21 /
`receive-statement-email` v21).** Colpatria prints per line "Valor
transacción", "Cuotas", "Pago a capital" and "Saldo pendiente". The reader
gave paid-off lines (CANCELADA, cuotas 0/1, pago a capital $0) an amount of 0
and once took "Pago a capital", so 6 of a Colombian tester's 10 months didn't
reconcile (May: COP 2,108,366 = exactly those lines). The prompt now says a
line's amount is always its own charged value, CANCELADA/0-1 lines count in
full (the bank includes them in the period's total and lists the payment that
covered them), and interest/fees shown only in the payment summary
("Intereses corrientes", "Otros cargos") are added as a cutoff-dated line.
Dry run: 9 of 10 Colpatria months reconcile to the peso (March still off by
COP 45,706); BAC and Davivienda unchanged.

**Previous-periods section (23 Oct 2026, `parse-statement` v22 /
`receive-statement-email` v22).** Colpatria also prints "Transacciones de
periodos anteriores": its "1/1" lines are purchases that posted after their
own period closed (part of this period's "Valor transacciones del periodo",
so they must be listed), while lines past their first cuota (e.g. Lifemiles
"2/36" with a COP 46 "Pago a capital") repeat a deferred purchase already
charged in full on an earlier statement and must be skipped. March was off by
exactly that Lifemiles line; a first wording made October drop two 1/1 lines
(COP 104,950), so the rule now says "list the 1/1 lines; skip only those past
the first cuota". Dry run with the production self-check retry: all 10
Colpatria months reconcile (August off by COP 2, a bank rounding), BAC and
Davivienda unchanged.
