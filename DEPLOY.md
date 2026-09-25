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
