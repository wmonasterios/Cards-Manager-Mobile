# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Release workflow

Full detail in `DEPLOY.md` — the short version so it's never forgotten:

- Two EAS Update channels: `preview` (auto-publishes on every push to
  `main`) and `production` (only on a `vX.Y.Z` git tag push, or manual
  workflow_dispatch). A normal JS/UI/logic change just needs a push to
  `main` — never run `eas build` for that.
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
