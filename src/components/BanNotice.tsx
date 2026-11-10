import { ShieldBan, LogOut } from 'lucide-react';
import { AppScreen } from '@/components/AppScreen';
import { Button } from '@/components/ui/button';

type BanNoticeProps = {
  title: string;
  ban: { until: string | null; reason: string | null; ban_code?: number | null };
  onSignOut?: (() => void) | undefined;
};

export function BanNotice({ title, ban, onSignOut }: BanNoticeProps) {
  return (
    <AppScreen navigation={false}>
      <section dir="rtl" className="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <ShieldBan className="size-14 text-destructive" aria-hidden="true" />
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="w-full border-y border-border py-5">
          <p className="text-sm text-muted-foreground">كود الحظر</p>
          <p dir="ltr" className="mt-2 break-all text-4xl font-bold tabular-nums text-destructive">{ban.ban_code ?? '—'}</p>
        </div>
        <div className="w-full space-y-2">
          <h2 className="font-semibold">سبب الحظر</h2>
          <p className="break-words text-base [overflow-wrap:anywhere]">{ban.reason?.trim() || 'لم يتم تحديد سبب الحظر'}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {ban.until ? `الحظر لحد ${new Date(ban.until).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}` : 'الحظر نهائي'}
        </p>
        {onSignOut && <Button variant="secondary" onClick={onSignOut}><LogOut />تسجيل الخروج</Button>}
      </section>
    </AppScreen>
  );
}