import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';

// By default expo-updates opens the app with the bundle it already has and
// downloads a newer OTA in the background, to be applied on the NEXT cold
// start. A tester installing from TestFlight therefore saw the build's old
// embedded bundle first (US$ on COP amounts, English week tags) and had to
// close and reopen to see what was already published.
//
// Instead, at launch (while the app is still on its blank loading view) we
// ask for an update for a few seconds. If one is downloaded in time we reload
// straight into it; if not (offline, slow network, nothing new), the app opens
// as before and the update applies on the next launch. It never reloads once
// the user is looking at a screen.
const LAUNCH_UPDATE_TIMEOUT_MS = 3000;

// Once per JS runtime: after a reload the new bundle runs this again, finds
// nothing newer and opens normally, so it can't loop.
let launchCheckStarted = false;

export function useLaunchUpdate(): boolean {
  // isEmergencyLaunch: the last update failed to start and the app fell back
  // to the embedded bundle; don't try to reload into anything right now.
  const skip = __DEV__ || !Updates.isEnabled || Updates.isEmergencyLaunch || launchCheckStarted;
  const [checking, setChecking] = useState(!skip);

  useEffect(() => {
    if (skip) return;
    launchCheckStarted = true;
    let settled = false;
    const open = () => {
      if (settled) return;
      settled = true;
      setChecking(false);
    };
    const timer = setTimeout(open, LAUNCH_UPDATE_TIMEOUT_MS);

    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable && !settled) {
          const fetched = await Updates.fetchUpdateAsync();
          if (fetched.isNew && !settled) {
            settled = true;
            clearTimeout(timer);
            await Updates.reloadAsync();
            return;
          }
        }
      } catch {
        // Offline, server error or reload refused: open with what we have.
      }
      clearTimeout(timer);
      open();
    })();

    return () => clearTimeout(timer);
    // Runs once, at launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return checking;
}
