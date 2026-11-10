export type SignupOutcome = 'signed-in' | 'confirm-email';

/** Supabase returns no session when email confirmation is required. */
export function signupOutcome(session: unknown): SignupOutcome {
  return session ? 'signed-in' : 'confirm-email';
}

/** Maps Supabase auth error codes/messages to Arabic text shown to the user. */
export function authErrorMessage(error: { code?: string | undefined; message?: string | undefined } | null | undefined): string {
  const code = error?.code ?? '';
  const message = (error?.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return 'أكّد بريدك الإلكتروني أولاً من الرسالة التي وصلتك';
  if (code === 'user_already_exists' || message.includes('already registered')) return 'هذا البريد مسجّل مسبقاً، سجّل الدخول بدلاً من ذلك';
  if (code === 'user_banned' || message.includes('banned')) return 'حسابك محظور من الإدارة';
  if (code === 'weak_password') return 'كلمة المرور ضعيفة، اختر كلمة أقوى';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || message.includes('rate limit')) return 'محاولات كثيرة، انتظر قليلاً ثم حاول مجدداً';
  if (code === 'signup_disabled') return 'إنشاء الحسابات متوقف حالياً';
  return 'تعذّر إكمال العملية، حاول مرة أخرى';
}
