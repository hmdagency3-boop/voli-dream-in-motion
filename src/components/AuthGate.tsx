import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useAccount } from '@/hooks/use-account';
import { getMyBan, type MyBan } from '@/lib/member-ban';
import { supabase } from '@/lib/supabase';
import { deviceCheckIn, type DeviceBan } from '@/lib/device-check.functions';
import { getDeviceDetails, getDeviceId } from '@/lib/device-info';
import { reportDevice } from '@/lib/device-report';
import { useServerFn } from '@tanstack/react-start';
import { BanNotice } from '@/components/BanNotice';

/** Paths reachable without an account. Everything else requires sign-in. */
export const PUBLIC_PATHS = ['/login', '/signup'];

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.includes(pathname.replace(/\/+$/, '') || '/');
}

/**
 * Whether the page on screen may be shown. While the router moves to a new
 * address it keeps showing the previous page, so both the address and the page
 * actually on screen must be allowed: signed-out visitors only ever see the
 * sign-in pages, signed-in members never see them.
 */
export function canShowPage(opts: { ready: boolean; signedIn: boolean; path: string; shownPath: string }) {
  if (!opts.ready) return false;
  const pathOpen = isPublicPath(opts.path);
  const shownOpen = isPublicPath(opts.shownPath);
  return opts.signedIn ? !pathOpen && !shownOpen : pathOpen && shownOpen;
}

export function AuthGate({ children }: { children: ReactNode }) {
  return <MemberGate>{children}</MemberGate>;
}

function MemberGate({ children }: { children: ReactNode }) {
  const { session, ready } = useAccount();
  const userId = session?.user.id;
  const [ban, setBan] = useState<MyBan | null>(null);
  useEffect(() => {
    setBan(null);
    let alive = true;
    if (userId) getMyBan().then((result) => { if (alive) setBan(result); });
    return () => { alive = false; };
  }, [userId]);
  useEffect(() => {
    if (userId) void reportDevice();
  }, [userId]);
  const [deviceBan, setDeviceBan] = useState<DeviceBan | null>(null);
  const [checkedIdentity, setCheckedIdentity] = useState<string | null>(null);
  const checkDevice = useServerFn(deviceCheckIn);
  const token = session?.access_token;
  const identity = userId ?? 'signed-out';
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      try {
        const details = await getDeviceDetails();
        const result = await checkDevice({
          data: { deviceId: getDeviceId(), ...details },
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        });
        if (alive) setDeviceBan(result);
      } catch { /* never block the app on a failed check */ }
      finally { if (alive) setCheckedIdentity(identity); }
    })();
    return () => { alive = false; };
  }, [ready, identity, token, checkDevice]);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const shownPath = useRouterState({
    select: (s) => s.matches[s.matches.length - 1]?.pathname ?? s.location.pathname,
  });
  const navigate = useNavigate();
  const open = isPublicPath(pathname);

  useEffect(() => {
    if (!ready) return;
    if (!session && !open) navigate({ to: '/login', replace: true });
    if (session && open) navigate({ to: '/', replace: true });
  }, [ready, session, open, navigate]);

  if (checkedIdentity !== identity || !canShowPage({ ready, signedIn: !!session, path: pathname, shownPath })) {
    return <div className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">…</div>;
  }
  if (deviceBan) return <BanNotice title={deviceBan.kind === 'account' ? 'حسابك محظور' : deviceBan.kind === 'device' ? 'هذا الجهاز محظور' : 'هذه الشبكة محظورة'} ban={deviceBan} onSignOut={session ? () => { void supabase.auth.signOut(); } : undefined} />;
  if (session && ban) return <BanNotice title="حسابك محظور" ban={ban} onSignOut={() => { void supabase.auth.signOut(); }} />;
  return <>{children}</>;
}
