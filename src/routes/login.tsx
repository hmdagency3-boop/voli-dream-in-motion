import { createFileRoute } from "@tanstack/react-router";
import { AccountForm } from "@/components/AccountForm";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — voli" },
      { name: "description", content: "سجّل دخولك إلى voli وتابع البثوث المباشرة وأصدقاءك." },
      { property: "og:title", content: "تسجيل الدخول — voli" },
      { property: "og:description", content: "سجّل دخولك إلى voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  return <AccountForm />;
}
