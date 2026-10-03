const base = require('./app.json').expo;

// EAS sets APP_VARIANT per build profile (see eas.json). The "preview"
// variant — used by the `development` and `preview` build profiles — gets
// its own bundle id/name so it installs as a separate app on a device,
// side by side with the real "Poquet" (the production/TestFlight/App Store
// build, which stays on the plain values from app.json). Without this, both
// profiles share one bundle id and whichever gets installed last silently
// replaces the other on the device — see AGENTS.md "Release workflow".
const isPreview = process.env.APP_VARIANT === 'preview';

module.exports = {
  expo: {
    ...base,
    name: isPreview ? `${base.name} Preview` : base.name,
    ios: {
      ...base.ios,
      bundleIdentifier: isPreview ? `${base.ios.bundleIdentifier}.preview` : base.ios.bundleIdentifier,
    },
    android: {
      ...base.android,
      package: isPreview ? `${base.android.package}.preview` : base.android.package,
    },
  },
};
