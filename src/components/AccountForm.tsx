import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppScreen } from '@/components/AppScreen';
import { accountSchema, loginSchema } from '@/lib/account-validation';
import { supabase } from '@/lib/supabase';
import { authErrorMessage, signupOutcome } from '@/lib/auth-messages';

export function AccountForm({ signup = false }: { signup?: boolean }) {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setNotice('');
    const data = new FormData(event.currentTarget);
    const result = (signup ? accountSchema : loginSchema).safeParse({
      displayName: data.get('displayName'), email: data.get('email'), password: data.get('password'),
    });
    if (!result.success) { setError(result.error.issues[0]?.message ?? 'راجع البيانات'); return; }
    setBusy(true);
    try {
      if (signup) {
        const values = result.data as { displayName: string; email: string; password: string };
        const { data: res, error: err } = await supabase.auth.signUp({
          email: values.email, password: values.password,
          options: { data: { display_name: values.displayName }, emailRedirectTo: `${window.location.origin}/me` },
        });
        if (err) { setError(authErrorMessage(err)); return; }
        if (signupOutcome(res.session) === 'confirm-email') {
          setNotice('تم إنشاء حسابك. أرسلنا رسالة تأكيد إلى بريدك، افتحها ثم سجّل الدخول.');
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: result.data.email, password: result.data.password });
        if (err) { setError(authErrorMessage(err)); return; }
      }
      navigate({ to: '/me' });
    } catch {
      setError('تعذّر الاتصال، تحقق من الإنترنت وحاول مجدداً');
    } finally {
      setBusy(false);
    }
  }
  const field = 'flex min-w-0 items-center gap-3 rounded-2xl border bg-card px-4 py-3 focus-within:border-primary';
  const input = 'min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground';
  return (
    <AppScreen navigation={false}>
      <div className="relative h-56 bg-brand">
        <div className="absolute bottom-14 right-6 text-on-media"><h1 className="font-display text-4xl font-extrabold">voli.</h1></div>
      </div>
      <section className="relative -mt-8 rounded-t-[2rem] bg-background px-6 pt-8 pb-10">
        <h2 className="text-2xl font-bold">{signup ? 'إنشاء حساب' : 'أهلاً بعودتك'}</h2>
        <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
          {signup && <label className={field}><User className="size-5 shrink-0 text-muted-foreground" /><input aria-label="اسم المستخدم" name="displayName" autoComplete="name" placeholder="اسم المستخدم" className={input} /></label>}
          <label className={field}><Mail className="size-5 shrink-0 text-muted-foreground" /><input aria-label="البريد الإلكتروني" name="email" type="email" autoComplete="email" placeholder="البريد الإلكتروني" className={input} /></label>
          <label className={field}><Lock className="size-5 shrink-0 text-muted-foreground" /><input aria-label="كلمة المرور" name="password" type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} placeholder="كلمة المرور" className={input} /><Button type="button" size="icon" variant="ghost" className="shrink-0" aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</Button></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="rounded-2xl bg-secondary p-3 text-sm">{notice}</p>}
          <Button type="submit" disabled={busy} className="h-12 w-full rounded-full bg-brand font-bold">{busy ? 'جارٍ التحميل…' : signup ? 'إنشاء حساب' : 'تسجيل الدخول'}</Button>
        </form>
        <p className="mt-8 text-center text-sm text-muted-foreground">{signup ? 'لديك حساب؟ ' : 'ليس لديك حساب؟ '}<Button asChild variant="link" className="h-auto p-0"><Link to={signup ? '/login' : '/signup'}>{signup ? 'تسجيل الدخول' : 'أنشئ حساباً'}</Link></Button></p>
      </section>
    </AppScreen>
  );
}
