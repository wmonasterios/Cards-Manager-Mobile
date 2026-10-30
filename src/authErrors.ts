// Supabase Auth returns its error messages in English. This turns the ones
// people actually hit into friendly copy in the app's language, with a
// generic fallback (never the raw English text) for anything unrecognized.
type Lang = 'en' | 'es';

// `code` is a fixed name for analytics (signup_failed), never the message.
const RULES: { code: string; test: RegExp; es: string; en: string }[] = [
  {
    code: 'invalid_credentials',
    test: /invalid login credentials/i,
    es: 'El correo o la contraseña no son correctos.',
    en: 'The email or password is incorrect.',
  },
  {
    code: 'not_confirmed',
    test: /email not confirmed/i,
    es: 'Todavía no confirmaste tu correo. Revisa tu bandeja de entrada.',
    en: "You haven't confirmed your email yet. Check your inbox.",
  },
  {
    code: 'already_registered',
    test: /user already registered|already been registered/i,
    es: 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.',
    en: 'An account with this email already exists. Sign in or reset your password.',
  },
  {
    code: 'weak_password',
    test: /password should be at least|password is too short|weak password/i,
    es: 'La contraseña es muy corta. Usa al menos 8 caracteres.',
    en: 'That password is too short. Use at least 8 characters.',
  },
  {
    code: 'same_password',
    test: /new password should be different/i,
    es: 'La nueva contraseña debe ser distinta a la anterior.',
    en: 'Your new password must be different from the old one.',
  },
  {
    code: 'bad_code',
    test: /token has expired|otp.*(expired|invalid)|invalid.*(token|otp)/i,
    es: 'El código no es válido o ya venció. Pide uno nuevo.',
    en: 'That code is invalid or has expired. Request a new one.',
  },
  {
    code: 'rate_limited',
    test: /rate limit|too many requests|for security purposes, you can only request/i,
    es: 'Hiciste demasiados intentos. Espera un minuto y vuelve a intentarlo.',
    en: 'Too many attempts. Wait a minute and try again.',
  },
  {
    code: 'invalid_email',
    test: /invalid format|unable to validate email|invalid email/i,
    es: 'Revisa el correo: el formato no es válido.',
    en: "Check the email address — it doesn't look valid.",
  },
  {
    code: 'network',
    test: /network|timeout|fetch failed|failed to fetch/i,
    es: 'No hay conexión. Revisa tu internet e intenta de nuevo.',
    en: 'No connection. Check your internet and try again.',
  },
  {
    code: 'signups_disabled',
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

// A fixed code for the error, for analytics: never the message itself.
export function authErrorCode(message: string | null | undefined): string {
  const msg = message ?? '';
  return RULES.find((r) => r.test.test(msg))?.code ?? 'other';
}
