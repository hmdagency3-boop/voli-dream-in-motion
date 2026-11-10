import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AgencyCrest, AgencyTopBar } from "@/components/agency/AgencyParts";
import { agencyErrorMessage, applicationSchema, applyForAgency, type ApplicationInput } from "@/lib/agency";

export const Route = createFileRoute("/agency/apply")({
  head: () => ({
    meta: [
      { title: "طلب فتح وكالة — voli" },
      { name: "description", content: "قدّم طلب فتح وكالة على voli، وبعد موافقة الإدارة بتاخد كود وكالة تلقائي." },
      { property: "og:title", content: "طلب فتح وكالة — voli" },
      { property: "og:description", content: "افتح وكالتك على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApplyPage,
});

const fields: { key: keyof ApplicationInput; label: string; placeholder: string; dir?: "ltr"; inputMode?: "tel" }[] = [
  { key: "agency_name", label: "اسم الوكالة", placeholder: "مثلاً: وكالة النجوم" },
  { key: "full_name", label: "اسمك الكامل", placeholder: "الاسم زي البطاقة" },
  { key: "phone", label: "رقم الواتساب", placeholder: "+201001234567", dir: "ltr", inputMode: "tel" },
  { key: "country", label: "الدولة", placeholder: "مصر" },
];

function ApplyPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<ApplicationInput>({ agency_name: "", full_name: "", phone: "", country: "", note: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof ApplicationInput, string>>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = applicationSchema.safeParse(form);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof ApplicationInput] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await applyForAgency(form);
      toast.success("طلبك وصل للإدارة، هنبلغك بعد المراجعة");
      navigate({ to: "/agency", replace: true });
    } catch (err) {
      toast.error(agencyErrorMessage(err));
    } finally { setBusy(false); }
  }

  return (
    <AppScreen>
      <AgencyTopBar title="طلب فتح وكالة" />
      <div className="flex justify-center"><AgencyCrest className="w-28" /></div>
      <form onSubmit={submit} className="mx-4 mt-2 space-y-4 rounded-[1.5rem] border bg-card p-5 shadow-soft" noValidate>
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={f.key}>{f.label}</Label>
            <Input
              id={f.key} value={form[f.key] ?? ""} placeholder={f.placeholder} dir={f.dir} inputMode={f.inputMode}
              onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
              aria-invalid={!!errors[f.key]} className="rounded-xl"
            />
            {errors[f.key] && <p className="text-xs text-destructive">{errors[f.key]}</p>}
          </div>
        ))}
        <div className="space-y-1.5">
          <Label htmlFor="note">ملاحظات (اختياري)</Label>
          <Textarea id="note" value={form.note ?? ""} maxLength={300} rows={3} placeholder="عدد المضيفين المتوقع، خبرتك…"
            onChange={(e) => setForm((v) => ({ ...v, note: e.target.value }))} className="rounded-xl" />
          {errors.note && <p className="text-xs text-destructive">{errors.note}</p>}
        </div>
        <p className="text-xs text-muted-foreground">بياناتك بتوصل للإدارة بس، ومحدش من الأعضاء بيشوفها.</p>
        <Button type="submit" disabled={busy} className="w-full rounded-full">{busy ? "…" : "إرسال الطلب"}</Button>
      </form>
    </AppScreen>
  );
}
