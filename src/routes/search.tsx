import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Search, Trash2, User } from "lucide-react";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { SpecialIdBadge } from "@/components/SpecialIdBadge";
import { useAccount } from "@/hooks/use-account";
import { parseIdQuery, searchUsersById, type FoundUser } from "@/lib/user-search";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "بحث — voli" },
      { name: "description", content: "ابحث عن المستخدمين على voli بالـ ID أو الايدي المميز." },
      { property: "og:title", content: "بحث — voli" },
      { property: "og:description", content: "ابحث عن المستخدمين على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

const HISTORY_KEY = "voli-search-history";

type State =
  | { kind: "idle" } | { kind: "invalid" } | { kind: "loading" }
  | { kind: "done"; users: FoundUser[] } | { kind: "error" };

function SearchPage() {
  const { session, ready } = useAccount();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]")); } catch { /* ignore */ }
    inputRef.current?.focus();
  }, []);

  const saveHistory = (list: string[]) => { setHistory(list); localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); };

  const run = async (raw: string) => {
    if (!session) return;
    const id = parseIdQuery(raw);
    if (!id) { setState({ kind: raw.trim() ? "invalid" : "idle" }); return; }
    setState({ kind: "loading" });
    saveHistory([id, ...history.filter((h) => h !== id)].slice(0, 10));
    try {
      const users = await searchUsersById(id);
      setState({ kind: "done", users });
    } catch { setState({ kind: "error" }); }
  };

  return (
    <AppScreen navigation={false}>
      <header className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center px-4 pt-5">
        <Button asChild variant="ghost" size="icon" aria-label="رجوع" className="rounded-full">
          <Link to="/"><ArrowRight className="size-6" /></Link>
        </Button>
        <h1 className="text-center font-display text-xl font-extrabold">بحث</h1>
        <span />
      </header>

      <form onSubmit={(e) => { e.preventDefault(); run(query); }} className="mx-4 mt-5 flex items-center gap-2 rounded-full bg-secondary p-1.5 ps-4">
        <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef} type="text" inputMode="numeric" aria-label="ابحث بالـ ID"
          placeholder="ابحث بالايدي / الايدي المميز" value={query}
          onChange={(e) => setQuery(e.target.value)} disabled={!session}
          className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <Button type="submit" disabled={!session} className="shrink-0 rounded-full px-6">ابحث</Button>
      </form>

      <div className="px-5 pt-4 text-sm" aria-live="polite">
        {!ready ? null : !session ? (
          <div className="flex items-center justify-between gap-3 text-muted-foreground">
            <span>سجّل الدخول علشان تقدر تبحث</span>
            <Button asChild size="sm" className="rounded-full"><Link to="/login">تسجيل الدخول</Link></Button>
          </div>
        ) : state.kind === "invalid" ? <p className="text-muted-foreground">الـ ID أرقام بس</p>
        : state.kind === "loading" ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> جاري البحث…</p>
        : state.kind === "error" ? <p className="text-destructive">حصلت مشكلة في البحث، حاول تاني</p>
        : state.kind === "done" && state.users.length === 0 ? <p className="text-muted-foreground">مفيش مستخدم بالـ ID ده</p>
        : state.kind === "done" ? (
          <ul className="flex flex-col gap-2">
            {state.users.map((u) => (
              <li key={u.public_id}>
                <Link to="/user/$publicId" params={{ publicId: String(u.public_id) }} className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-2.5">
                  {u.avatar_url ? <img src={u.avatar_url} alt="" className="size-11 rounded-full object-cover" />
                    : <span className="grid size-11 place-items-center rounded-full bg-secondary text-muted-foreground"><User className="size-5" /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{u.display_name}</p>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {u.special_id ? <SpecialIdBadge id={u.special_id} vipLevel={Number(u.vip_level ?? 0)} className="w-20" />
                        : <span dir="ltr">ID: {u.public_id}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {session && history.length > 0 && (
        <section className="mt-6 px-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">سجل البحث</h2>
            <Button variant="ghost" size="icon" aria-label="مسح السجل" onClick={() => saveHistory([])} className="text-muted-foreground"><Trash2 className="size-5" /></Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {history.map((h) => (
              <button key={h} type="button" onClick={() => { setQuery(h); run(h); }} className="rounded-full bg-secondary px-4 py-1.5 text-sm text-muted-foreground transition hover:text-foreground">{h}</button>
            ))}
          </div>
        </section>
      )}
    </AppScreen>
  );
}
