import { describe, expect, it } from 'vitest';
import { canShowPage, isPublicPath } from '@/components/AuthGate';

describe('sign-in required', () => {
  it('only login and signup are open without an account', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/signup')).toBe(true);
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/me')).toBe(false);
    expect(isPublicPath('/chat')).toBe(false);
  });

  it('shows nothing before the sign-in check finishes', () => {
    expect(canShowPage({ ready: false, signedIn: false, path: '/login', shownPath: '/login' })).toBe(false);
    expect(canShowPage({ ready: false, signedIn: true, path: '/me', shownPath: '/me' })).toBe(false);
  });

  it('never shows an inside page to a signed-out visitor, even while moving to login', () => {
    expect(canShowPage({ ready: true, signedIn: false, path: '/login', shownPath: '/' })).toBe(false);
    expect(canShowPage({ ready: true, signedIn: false, path: '/me', shownPath: '/me' })).toBe(false);
    expect(canShowPage({ ready: true, signedIn: false, path: '/login', shownPath: '/login' })).toBe(true);
  });

  it('never shows the login page to a signed-in member', () => {
    expect(canShowPage({ ready: true, signedIn: true, path: '/', shownPath: '/login' })).toBe(false);
    expect(canShowPage({ ready: true, signedIn: true, path: '/login', shownPath: '/login' })).toBe(false);
    expect(canShowPage({ ready: true, signedIn: true, path: '/me', shownPath: '/me' })).toBe(true);
  });
});
