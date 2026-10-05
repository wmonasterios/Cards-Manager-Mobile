import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// A local, device-only unlock PIN — the fallback for devices without Face ID/
// Touch ID, or for when biometrics fail/aren't enrolled. Only a salted hash
// ever touches disk, and nothing here is sent to the server: this is purely a
// "is this the same person who was just using the phone" check, not an
// account credential.
// SecureStore keys may only contain alphanumeric characters, ".", "-" and
// "_" — no ":" (unlike this project's AsyncStorage key convention).
const HASH_KEY = 'cardsManager.pinHash';
const SALT_KEY = 'cardsManager.pinSalt';
const ATTEMPTS_KEY = 'cardsManager.pinAttempts';
const LOCKED_UNTIL_KEY = 'cardsManager.pinLockedUntil';

export const PIN_LENGTH = 6;
const MAX_ATTEMPTS_BEFORE_LOCKOUT = 5;
const LOCKOUT_MS = 30_000;

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function hasPin(): Promise<boolean> {
  try {
    const hash = await SecureStore.getItemAsync(HASH_KEY);
    return !!hash;
  } catch {
    // A broken keychain/keystore read must never be read as "PIN required" —
    // LockGate treats this the same as "no PIN set up".
    return false;
  }
}

export async function setPin(pin: string): Promise<void> {
  const salt = Crypto.randomUUID();
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(SALT_KEY, salt);
  await SecureStore.setItemAsync(HASH_KEY, hash);
  await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
  await SecureStore.deleteItemAsync(LOCKED_UNTIL_KEY);
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(HASH_KEY);
  await SecureStore.deleteItemAsync(SALT_KEY);
  await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
  await SecureStore.deleteItemAsync(LOCKED_UNTIL_KEY);
}

// Returns the ms remaining before another attempt is allowed, or 0 if free to try.
export async function pinLockoutRemainingMs(): Promise<number> {
  try {
    const until = Number(await SecureStore.getItemAsync(LOCKED_UNTIL_KEY)) || 0;
    return Math.max(0, until - Date.now());
  } catch {
    return 0;
  }
}

export async function verifyPin(pin: string): Promise<boolean> {
  const remaining = await pinLockoutRemainingMs();
  if (remaining > 0) return false;

  const [salt, storedHash] = await Promise.all([
    SecureStore.getItemAsync(SALT_KEY),
    SecureStore.getItemAsync(HASH_KEY),
  ]);
  if (!salt || !storedHash) return false;

  const hash = await hashPin(pin, salt);
  if (hash === storedHash) {
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
    await SecureStore.deleteItemAsync(LOCKED_UNTIL_KEY);
    return true;
  }

  const attempts = (Number(await SecureStore.getItemAsync(ATTEMPTS_KEY)) || 0) + 1;
  await SecureStore.setItemAsync(ATTEMPTS_KEY, String(attempts));
  if (attempts >= MAX_ATTEMPTS_BEFORE_LOCKOUT) {
    await SecureStore.setItemAsync(LOCKED_UNTIL_KEY, String(Date.now() + LOCKOUT_MS));
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
  }
  return false;
}
