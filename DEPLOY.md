# Releasing

Two EAS Update channels, two GitHub workflows. Pushing to `main` never, by
itself, reaches whatever build is live on the App Store / Play Store.

## Day-to-day (preview)

Every push to `main` auto-publishes an OTA update to the **`preview`**
channel (`.github/workflows/eas-update.yml`). Your own test build — the dev
client, an internal TestFlight build, or an internal APK — should be the
thing running on `preview`. This is where all normal work lands; nothing
here can reach a production build.

## Shipping to production

Once a set of changes on `main` has been checked on `preview` and you're
ready to ship, tag the commit:

```
git tag v1.1.1
git push origin v1.1.1
```

That triggers `.github/workflows/eas-update-production.yml`, which publishes
the current `main` to the **`production`** channel — the one your actual
App Store / Play Store build listens on. Tags don't have to exactly match
`app.json`'s `version`, but keeping them in sync avoids confusion.

You can also trigger a production publish by hand from the Actions tab
(`workflow_dispatch` on "Publish EAS Update (production)") if you'd rather
not tag.

Recommended: add yourself as a required reviewer on the `production`
GitHub Environment (Settings → Environments → production) so a tag push or
manual dispatch waits for your approval before it actually publishes — a
safety net against a mistaken tag.

## New native build (only needed for native changes, not JS-only ones)

Most changes (UI, logic, edge functions) ship as OTA updates above with no
new build and no store review. You only need a new native build when
something native changes — a new native module, permissions, the icon, the
app version.

```
eas build --profile preview      # internal test build, bound to channel "preview"
eas build --profile production   # store build, bound to channel "production"
eas submit --profile production  # upload the production build to App Store Connect / Play Console
```

The first time you build each profile, EAS creates and binds that channel
to a branch of the same name — do this once per profile before relying on
the workflows above to actually reach a real device.

## First TestFlight release (one-time setup)

Run all of this from your own Mac, logged into `eas` with your own Expo
account (`npx eas-cli login`) — Apple's 2FA and App Store Connect agreements
need a real interactive session.

1. **Apple Developer Program** (if you haven't already): enroll at
   developer.apple.com, $99/year. Pick **Individual** unless you specifically
   need an Organization account — it's approved much faster and is enough
   for TestFlight. This is the one step that can take a day or two; start it
   first.
2. **Build the store binary**:
   ```
   eas build --platform ios --profile production
   ```
   First run: let EAS manage credentials ("Let Expo handle it" when asked).
   It creates the distribution certificate, provisioning profile, and — since
   `expo-apple-authentication` is a plugin here — enables the Sign In with
   Apple capability on the App ID automatically. It also registers the
   `com.poquet` bundle ID and creates the app record in App Store Connect if
   it doesn't exist yet.
3. **Submit it**:
   ```
   eas submit --platform ios --profile production
   ```
   This uploads the build to App Store Connect. Apple takes a few minutes to
   "process" it before it's selectable in TestFlight.
4. **In App Store Connect → your app → TestFlight**, fill in once:
   - **Test Information**: what testers should try, your contact email,
     and the **Privacy Policy URL** — use
     `https://github.com/wmonasterios/cards-manager-mobile/blob/main/PRIVACY.md`
     (or your own hosted copy of `PRIVACY.md`).
   - Answer the **Export Compliance** question (standard encryption only —
     HTTPS — so "No" to using non-exempt encryption is almost always right).
5. **Add testers**:
   - **Internal testers** (anyone added as a user on your App Store Connect
     team, up to 100): see new builds instantly, no review needed. Good for
     yourself and anyone you add as a team member.
   - **External testers** (anyone else — actual friends & family, up to
     10,000): create an External Testing group, add them by email (or share
     a public link), and submit the build for **Beta App Review** — a quick
     automated-then-human check, usually well under 48h, only required again
     if a future build adds new permissions/capabilities.
6. From here on, every future build for this version ships OTA automatically
   via the `production` channel (see "Shipping to production" above) — no
   new TestFlight build or review needed unless something native changes.
