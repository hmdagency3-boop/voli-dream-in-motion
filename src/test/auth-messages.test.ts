import { describe, expect, it } from 'vitest';
import { authErrorMessage, signupOutcome } from '@/lib/auth-messages';

describe('auth outcomes', () => {
  it('requires email confirmation when signup returns no session', () => {
    expect(signupOutcome(null)).toBe('confirm-email');
  });
  it('treats a returned session as signed in', () => {
    expect(signupOutcome({ access_token: 'x' })).toBe('signed-in');
  });
  it('shows the wrong-credentials message for invalid_credentials', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  });
  it('tells unconfirmed users to confirm their email', () => {
    expect(authErrorMessage({ code: 'email_not_confirmed' })).toBe('أكّد بريدك الإلكتروني أولاً من الرسالة التي وصلتك');
  });
});
