// Supabase Auth returns its error messages in English. This turns the ones
// people actually hit into friendly copy in the app's language, with a
// generic fallback (never the raw English text) for anything unrecognized.
type Lang = 'en' | 'es';

const RULES: { test: RegExp; es: string; en: string }[] = [
  {
    test: /invalid login credentials/i,
    es: 'El correo o la contraseña no son correctos.',
    en: 'The email or password is incorrect.',
  },
  {
    test: /email not confirmed/i,
    es: 'Todavía no confirmaste tu correo. Revisa tu bandeja de entrada.',
    en: "You haven't confirmed your email yet. Check your inbox.",
  },
  {
    test: /user already registered|already been registered/i,
    es: 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.',
    en: 'An account with this email already exists. Sign in or reset your password.',
  },
  {
    test: /password should be at least|password is too short|weak password/i,
    es: 'La contraseña es muy corta. Usa al menos 8 caracteres.',
    en: 'That password is too short. Use at least 8 characters.',
  },
  {
    test: /new password should be different/i,
    es: 'La nueva contraseña debe ser distinta a la anterior.',
    en: 'Your new password must be different from the old one.',
  },
  {
    test: /token has expired|otp.*(expired|invalid)|invalid.*(token|otp)/i,
    es: 'El código no es válido o ya venció. Pide uno nuevo.',
    en: 'That code is invalid or has expired. Request a new one.',
  },
  {
    test: /rate limit|too many requests|for security purposes, you can only request/i,
    es: 'Hiciste demasiados intentos. Espera un minuto y vuelve a intentarlo.',
    en: 'Too many attempts. Wait a minute and try again.',
  },
  {
    test: /invalid format|unable to validate email|invalid email/i,
    es: 'Revisa el correo: el formato no es válido.',
    en: "Check the email address — it doesn't look valid.",
  },
  {
    test: /network|timeout|fetch failed|failed to fetch/i,
    es: 'No hay conexión. Revisa tu internet e intenta de nuevo.',
    en: 'No connection. Check your internet and try again.',
  },
  {
    test: /signups? not allowed|signup is disabled/i,
    es: 'Por ahora no se pueden crear cuentas nuevas.',
    en: "New accounts can't be created right now.",
  },
];

export function friendlyAuthError(message: string | null | undefined, lang: Lang): string {
  const msg = message ?? '';
  const rule = RULES.find((r) => r.test.test(msg));
  if (rule) return rule[lang];
  return lang === 'es' ? 'Algo salió mal. Intenta de nuevo en un momento.' : 'Something went wrong. Please try again in a moment.';
}
