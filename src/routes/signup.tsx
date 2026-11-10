import { createFileRoute } from '@tanstack/react-router';
import { AccountForm } from '@/components/AccountForm';
export const Route = createFileRoute('/signup')({
  head: () => ({ meta: [
    { title: 'إنشاء حساب — voli' },
    { name: 'description', content: 'أنشئ حسابك على voli باسمك ومعرّفك الخاص.' },
    { property: 'og:title', content: 'إنشاء حساب — voli' },
    { property: 'og:description', content: 'أنشئ حسابك على voli باسمك ومعرّفك الخاص.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: () => <AccountForm signup />,
});
