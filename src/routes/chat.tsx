import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, SquarePen, MessageCircle, Pin, User, Loader2 } from "lucide-react";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { VoliHelperAvatar } from "@/components/VoliHelperAvatar";
import { VoliHelperBadge } from "@/components/VoliHelperBadge";
import { useAccount } from "@/hooks/use-account";
import { activeVipLevel, vipTier } from "@/lib/vip";
import {
  ADMIN_NOTICE_ID, getConversations, getFriendIds, getPartnerByPublicId, pinAdminNotices,
  type ChatListItem, type ChatPartner, type ConversationSummary,
} from "@/lib/messages";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "الدردشات — voli" },
      { name: "description", content: "رسائلك ومحادثاتك على voli." },
      { property: "og:title", content: "الدردشات — voli" },
      { property: "og:description", content: "رسائلك ومحادثاتك على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

const tabs = ["الكل", "غير مقروءة", "الأصدقاء"] as const;
type Tab = (typeof tabs)[number];

function timeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
}

function ChatPage() {
  const { session } = useAccount();
  const me = session?.user.id;
  const [tab, setTab] = useState<Tab>("الكل");
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [helper, setHelper] = useState<ChatPartner | null>(null);
  const [friends, setFriends] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!me) return;
    let active = true;
    getPartnerByPublicId(ADMIN_NOTICE_ID).then((p) => active && setHelper(p)).catch(() => {});
    getFriendIds(me).then((f) => active && setFriends(f));
    const load = () => getConversations(me)
      .then((c) => active && setConversations(c))
      .catch(() => active && setConversations((prev) => prev ?? []));
    load();
    const t = setInterval(load, 5000);
    return () => { active = false; clearInterval(t); };
  }, [me]);

  const items = useMemo(() => {
    const all = pinAdminNotices(conversations ?? [], helper);
    const q = query.trim().toLowerCase();
    return all.filter((it) => {
      if (q) {
        const name = it.pinned ? "voli helper" : it.partner?.display_name.toLowerCase() ?? "";
        const id = String(it.pinned ? ADMIN_NOTICE_ID : it.partner?.public_id ?? "");
        if (!name.includes(q) && !id.includes(q)) return false;
      }
      if (tab === "غير مقروءة") return it.unread > 0;
      if (tab === "الأصدقاء") return !it.pinned && !!it.partner && friends.has(it.partner.auth_id);
      return true;
    });
  }, [conversations, helper, query, tab, friends]);

  const empty = tab === "الأصدقاء" ? "مفيش محادثات مع أصدقاء لسه" : tab === "غير مقروءة" ? "لا توجد رسائل غير مقروءة" : "لا توجد محادثات حالياً";

  return (
    <AppScreen>
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 pt-6">
          <h1 className="font-display text-3xl font-extrabold">دردشة<span className="text-primary">.</span></h1>
          <Button asChild aria-label="رسالة جديدة" size="icon" className="size-11 rounded-full"><Link to="/search"><SquarePen /></Link></Button>
        </header>
        <div className="mx-5 mt-5 flex items-center gap-2 rounded-full bg-secondary px-4 py-3">
          <Search className="size-4 text-muted-foreground" />
          <input aria-label="البحث في المحادثات" placeholder="البحث في المحادثات" value={query} onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </div>
        <nav aria-label="تصفية المحادثات" className="mt-5 flex gap-2 px-5">
          {tabs.map((item) => (
            <Button key={item} variant={item === tab ? "default" : "secondary"} aria-pressed={item === tab} onClick={() => setTab(item)} className="rounded-full">{item}</Button>
          ))}
        </nav>

        {me && conversations === null ? (
          <p role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> جاري التحميل…</p>
        ) : (
          <ul className="mt-4 flex flex-col px-3" aria-label="المحادثات">
            {items.map((it) => <ChatRow key={it.pinned ? "voli-helper" : it.partner!.auth_id} item={it} me={me} />)}
            {items.filter((it) => !it.pinned).length === 0 && (
              <li role="status" className="flex min-h-56 flex-col items-center justify-center gap-4 px-5 text-muted-foreground">
                <MessageCircle className="size-12 text-primary" aria-hidden="true" />
                <p className="text-sm">{empty}</p>
              </li>
            )}
          </ul>
        )}
    </AppScreen>
  );
}

function ChatRow({ item, me }: { item: ChatListItem; me: string | undefined }) {
  const { partner, last, unread, pinned } = item;
  const vip = pinned ? 0 : activeVipLevel(partner);
  const publicId = String(pinned ? ADMIN_NOTICE_ID : partner?.public_id);
  const preview = last
    ? `${last.sender_id === me ? "انت: " : ""}${last.body}`
    : pinned ? "رسائل وإشعارات رسمية من إدارة voli" : "";
  return (
    <li>
      <Link to="/chat/$publicId" params={{ publicId }}
        className={`flex items-center gap-3 rounded-2xl px-2 py-3 transition hover:bg-secondary ${pinned ? "bg-primary/10" : ""}`}>
        {pinned ? <VoliHelperAvatar className="size-12" />
          : partner?.avatar_url ? <img src={partner.avatar_url} alt="" className="size-12 shrink-0 rounded-full object-cover" />
          : <span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground"><User className="size-5" /></span>}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className={`truncate font-semibold ${vipTier(vip)?.text ?? ""}`}>{pinned ? "Voli Helper" : partner?.display_name}</span>
            {pinned && <VoliHelperBadge />}
            {pinned && <Pin className="ms-auto size-3.5 shrink-0 text-primary" aria-label="مثبتة" />}
          </p>
          <p className={`truncate text-sm ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{preview}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {last && <span className="text-[11px] text-muted-foreground">{timeLabel(last.created_at)}</span>}
          {unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums">{unread > 99 ? "99+" : unread}</span>}
        </div>
      </Link>
    </li>
  );
}
