import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, SendHorizontal, User } from "lucide-react";
import { toast } from "sonner";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";
import { activeVipLevel, vipTier } from "@/lib/vip";
import { getConversation, getPartnerByPublicId, isAdminNotice, markRead, sendMessage, type ChatPartner, type Message } from "@/lib/messages";
import { VoliHelperAvatar } from "@/components/VoliHelperAvatar";
import { VoliHelperBadge } from "@/components/VoliHelperBadge";

export const Route = createFileRoute("/chat_/$publicId")({
  head: () => ({
    meta: [
      { title: "محادثة — voli" },
      { name: "description", content: "محادثة خاصة على voli." },
      { property: "og:title", content: "محادثة — voli" },
      { property: "og:description", content: "محادثة خاصة على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConversationPage,
});

function ConversationPage() {
  const { publicId } = Route.useParams();
  const { session, ready, profile } = useAccount();
  const me = session?.user.id;
  const myVip = activeVipLevel(profile);
  // Voli Helper (ID 100) is the official management account: read-only notices, nobody can reply.
  const official = isAdminNotice(publicId);
  const [partner, setPartner] = useState<ChatPartner | null | undefined>(undefined);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!me) return;
    getPartnerByPublicId(Number(publicId)).then(setPartner).catch(() => setPartner(null));
  }, [me, publicId]);

  const other = partner?.auth_id;
  const partnerVip = activeVipLevel(partner);
  useEffect(() => {
    if (!me || !other) return;
    let active = true;
    const load = () => getConversation(me, other).then((m) => {
      if (!active) return;
      setMessages((prev) => (prev.length === m.length && prev.at(-1)?.id === m.at(-1)?.id ? prev : m));
      if (m.some((x) => x.recipient_id === me && !x.read_at)) markRead(me, other);
    }).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => { active = false; clearInterval(t); };
  }, [me, other]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!me || !other || !text.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(me, other, text);
      setText("");
      setMessages(await getConversation(me, other));
    } catch {
      toast.error("الرسالة ماتبعتتش، حاول تاني");
    } finally {
      setSending(false);
    }
  }

  return (
    <AppScreen navigation={false}>
      <div className="-mb-6 flex min-h-full flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Button asChild variant="ghost" size="icon" aria-label="رجوع" className="rounded-full">
          <Link to="/chat"><ChevronRight className="size-5" /></Link>
        </Button>
        {official ? <VoliHelperAvatar className="size-10" /> : partner?.avatar_url ? (
          <img src={partner.avatar_url} alt="" className="size-10 rounded-full object-cover" />
        ) : (
          <span className="grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground"><User className="size-5" /></span>
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold">
            <span className={`truncate ${official ? "" : vipTier(partnerVip)?.text ?? ""}`}>{official ? "Voli Helper" : partner?.display_name ?? "…"}</span>
            {official && <VoliHelperBadge />}
          </p>
          <p className="text-xs text-muted-foreground">{official ? "حساب الإدارة الرسمي" : <span dir="ltr">ID: {publicId}</span>}</p>
        </div>
      </header>

      {!ready ? null : !session ? (
        <div className="flex flex-col items-center gap-3 p-8 text-muted-foreground">
          <p>سجّل الدخول علشان تقدر تراسل</p>
          <Button asChild className="rounded-full"><Link to="/login">تسجيل الدخول</Link></Button>
        </div>
      ) : partner === undefined ? (
        <p className="flex items-center justify-center gap-2 p-8 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> جاري التحميل…</p>
      ) : partner === null ? (
        <p className="p-8 text-center text-muted-foreground">{official ? "مفيش إشعارات من الإدارة لسه" : "مفيش مستخدم بالـ ID ده"}</p>
      ) : partner.auth_id === me ? (
        <p className="p-8 text-center text-muted-foreground">مينفعش تراسل نفسك</p>
      ) : (
        <>
          <div className="flex flex-1 flex-col gap-2 px-4 py-4">
            {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{official ? "مفيش إشعارات من الإدارة لسه" : "ابدأ المحادثة بأول رسالة"}</p>}
            {messages.map((m) => {
              const mine = m.sender_id === me;
              // VIP 2+ senders get their tier's bubble (VIP 4+ neon glow).
              const tier = official ? undefined : vipTier(mine ? myVip : partnerVip);
              const vipBubble = tier?.chatBubble ? tier : null;
              const bubble = vipBubble
                ? `border-2 ${vipBubble.border} bg-card text-card-foreground`
                : mine ? "bg-primary text-primary-foreground" : "bg-secondary";
              return (
                <div
                  key={m.id}
                  // dir="auto": English messages/notices read left-to-right, Arabic right-to-left.
                  dir="auto"
                  className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-start text-sm ${mine ? "self-start" : "self-end"} ${bubble}`}
                  style={vipBubble?.chatBubble === "neon" ? { boxShadow: `0 0 12px ${vipBubble.color}` } : undefined}
                >
                  {m.body}
                  <span className={`mt-1 block text-[10px] ${mine && !vipBubble ? "text-primary-foreground/70" : "text-muted-foreground"}`} dir="ltr">
                    {new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          {official ? (
            <p className="sticky bottom-0 border-t bg-background px-4 py-3 text-center text-xs text-muted-foreground">دي رسائل رسمية من إدارة voli، ومينفعش الرد عليها هنا</p>
          ) : (
          <form onSubmit={onSend} className="sticky bottom-0 flex items-center gap-2 border-t bg-background px-4 py-3">
            <input
              aria-label="اكتب رسالة"
              placeholder="اكتب رسالة…"
              value={text}
              maxLength={4000}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-full bg-secondary px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" size="icon" aria-label="إرسال" disabled={!text.trim() || sending} className="size-10 shrink-0 rounded-full">
              {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal className="rotate-180" />}
            </Button>
          </form>
          )}
        </>
      )}
      </div>
    </AppScreen>
  );
}
