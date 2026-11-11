import { RoomTools, SeatMenu } from '@/components/RoomTools';
import { emptyRoomTools, getRoomTools, manageRoom, type RoomToolsState } from '@/lib/room-tools';
import { syncRoomVoice } from '@/lib/voice.functions';
import { vipChatBubbleArt, vipProfileCardArt } from "@/lib/vip-art";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2, Gift, Loader2, Lock, Mic, MicOff, Volume2, VolumeX, MessageCircle, Power, Share2, SendHorizontal, User, Users, X, Settings, ShieldCheck, Ban } from "lucide-react";
import { RoomRanking } from "@/components/RoomRanking";
import { RoomViewers } from "@/components/RoomViewers";
import trophyButton from "@/assets/rank/trophy-button.webp";
import coinIcon from "@/assets/coin.webp";
import diamondIcon from "@/assets/diamond.webp";
import { GiftSheet, type GiftSent, type GiftTarget } from "@/components/GiftSheet";
import { getGiftShows, getGiftsReceived, nextGiftShows, type GiftShow } from "@/lib/gifts";
import { GiftVideo } from "@/components/GiftVideo";
import { RoomGames } from "@/components/RoomGames";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VipProfileCard } from "@/components/VipProfileCard";
import { VipBadge } from "@/components/VipBadge";
import { VipEntrance } from "@/components/VipEntrance";
import { HeadwearFrame } from "@/components/HeadwearFrame";
import { RideEntrance } from "@/components/RideEntrance";
import { getWorn, useWorn, type WornItem } from "@/lib/store";
import { useAccount } from "@/hooks/use-account";
import { useRoomVoice } from "@/hooks/use-room-voice";
import { activeVipLevel, vipTier } from "@/lib/vip";
import { shownId } from "@/lib/special-id";
import {
  ROOM_HEARTBEAT_MS, ROOM_POLL_MS, endParty, enterRoom, getPeople, getRoomByOwnerPublicId, getRoomState, kickFromRoom,
  leaveRoom, leaveSeat, roomTheme, roomThemeStyle, sendRoomMessage, takeSeat,
  type EnterResult, type Room, type RoomMessage, type RoomPerson, type Seat,
} from "@/lib/rooms";

export const Route = createFileRoute("/room/$publicId")({
  head: () => ({
    meta: [
      { title: "روم الحفلة — voli" },
      { name: "description", content: "ادخل الروم، اطلع على المايك واتكلم مع الناس على voli." },
      { property: "og:title", content: "روم الحفلة — voli" },
      { property: "og:description", content: "ادخل الروم، اطلع على المايك واتكلم مع الناس على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoomPage,
});

type Status = "loading" | "missing" | "offline" | "password" | "kicked" | "inside" | "error";
type Tab = "all" | "chat";

/** 12500 -> 12.5K: keeps the coin count inside the trophy button. */
const shortCoins = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

function RoomPage() {
  const { publicId } = Route.useParams();
  const { session, profile, reload } = useAccount();
  const me = session?.user.id;
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>("loading");
  const [owner, setOwner] = useState<RoomPerson | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [tools, setTools] = useState<RoomToolsState>(emptyRoomTools);
  const [toolsReady, setToolsReady] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [seatMenu, setSeatMenu] = useState<number | null>(null);
  const [inviteSeat, setInviteSeat] = useState<number | null>(null);
  const [seatBusy, setSeatBusy] = useState(false);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [people, setPeople] = useState<Record<string, RoomPerson>>({});
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [picked, setPicked] = useState<RoomPerson | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [entrance, setEntrance] = useState(false);
  const [joins, setJoins] = useState<Join[]>([]);
  const [entrances, setEntrances] = useState<Join[]>([]);
  /** Store rides of members who just came in, shown one after another. */
  const [rides, setRides] = useState<{ key: string; name: string; ride: WornItem }[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  /** Coins thrown in this room, shown on the trophy button. */
  const [coins, setCoins] = useState(0);
  /** Gift box: open, who it opened for, what each person received here, and the gift that just flew. */
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftFor, setGiftFor] = useState<string[]>([]);
  const [received, setReceived] = useState<Record<string, number>>({});
  const [flying, setFlying] = useState<(GiftSent & { key: number }) | null>(null);
  /** Video gifts waiting to play for everyone inside, one after another. */
  const [videoQueue, setVideoQueue] = useState<GiftShow[]>([]);
  const showsCursor = useRef<number | null>(null);
  const pollShows = useRef<() => void>(() => {});
  const balance = Number(profile?.coins ?? 0);
  const endRef = useRef<HTMLDivElement>(null);
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const seenRef = useRef<Set<string> | null>(null);

  const isOwner = !!me && owner?.auth_id === me;
  const iAmSeated = !!me && seats.some((s) => s.auth_id === me);
  const isManager = isOwner || (!!me && tools.admins.includes(me));
  const mySeat = seats.find(s => s.auth_id === me);
  const forcedMuted = tools.controls.some(c => c.seat_no === mySeat?.seat_no && c.muted);
  const voice = useRoomVoice(room?.id, status === "inside", iAmSeated, forcedMuted);
  async function refreshTools() {
    if (!room?.id) return;
    const state = await getRoomTools(room.id);
    setTools(state); setToolsReady(true);
    const extra = [...state.blacklist, ...state.admins, ...state.impressions.map(i => i.auth_id)].filter(id => !peopleRef.current[id]);
    if (extra.length) {
      const found = await getPeople({ ids: extra });
      setPeople(prev => ({ ...prev, ...Object.fromEntries(found.map(p => [p.auth_id, p])) }));
    }
    const current = await getRoomState(room.id); if(current.room) setRoom(current.room); setSeats(current.seats);
    if (session && (isOwner || state.admins.includes(session.user.id))) {
      await syncRoomVoice({ data: { roomId: room.id, accessToken: session.access_token } }).catch(() => toast.error('إعدادات الروم اتحفظت، لكن تحديث الصوت ماوصلش؛ جرّب تاني'));
    }
  }

  const handleEnter = useCallback((res: EnterResult) => {
    if (res === "ok") { setStatus("inside"); return true; }
    setStatus(res === "wrong_password" ? "password" : res === "kicked" ? "kicked" : res === "not_live" ? "offline" : "missing");
    return false;
  }, []);

  // Find the room and try to enter.
  useEffect(() => {
    if (!me) return;
    let active = true;
    (async () => {
      try {
        const found = await getRoomByOwnerPublicId(Number(publicId));
        if (!active) return;
        if (!found) return setStatus("missing");
        setOwner(found.owner);
        setPeople((p) => ({ ...p, [found.owner.auth_id]: found.owner }));
        setRoom(found.room);
        if (!found.room) return setStatus("missing");
        if (!found.room.is_live) return setStatus("offline");
        const ok = handleEnter(await enterRoom(found.room.id));
        if (ok && active) setEntrance(true);
      } catch {
        if (active) setStatus("error");
      }
    })();
    return () => { active = false; };
  }, [me, publicId, handleEnter]);

  const roomId = room?.id;
  const inside = status === "inside";

  // Live refresh + "still here" heartbeat while inside; leave when the page closes.
  useEffect(() => {
    if (!inside || !roomId) return;
    let active = true;
    const load = async () => {
      const [s, got, t] = await Promise.all([getRoomState(roomId).catch(() => null), getGiftsReceived(roomId), getRoomTools(roomId).catch(() => null)]);
      if (!active || !s) return;
      if (t) { setTools(t); setToolsReady(true); }
      setReceived(got);
      if (s.room && !s.room.is_live) { setStatus("offline"); return; }
      if (s.room) setRoom(s.room);
      setMembers(s.members);
      setSeats(s.seats);
      setCoins(s.coins);
      setMessages((prev) => (prev.length === s.messages.length && prev.at(-1)?.id === s.messages.at(-1)?.id ? prev : s.messages));
      const unknown = [...new Set([...s.members, ...s.seats.map((x) => x.auth_id), ...s.messages.map((m) => m.sender_id)])]
        .filter((id) => !peopleRef.current[id]);
      if (unknown.length) {
        const found = await getPeople({ ids: unknown }).catch(() => []);
        if (!active) return;
        if (found.length) {
          const add = Object.fromEntries(found.map((x) => [x.auth_id, x]));
          peopleRef.current = { ...peopleRef.current, ...add };
          setPeople((p) => ({ ...p, ...add }));
        }
      }
      // Announce members who just came in (the first load only remembers who is already here).
      const seen = seenRef.current;
      seenRef.current = new Set(s.members);
      if (seen) {
        const now = new Date().toISOString();
        const fresh = s.members.filter((id) => !seen.has(id) && id !== me).map((id) => ({ key: `${id}-${now}`, auth_id: id, at: now }));
        if (fresh.length) {
          setJoins((j) => [...j, ...fresh].slice(-50));
          setEntrances((q) => [...q, ...fresh.filter((x) => activeVipLevel(peopleRef.current[x.auth_id]) > 0)]);
          void getWorn(fresh.map((x) => x.auth_id)).then((w) => {
            if (!active) return;
            const add = fresh.flatMap((x) => { const ride = w[x.auth_id]?.ride; return ride ? [{ key: x.key, name: peopleRef.current[x.auth_id]?.display_name ?? "", ride }] : []; });
            if (add.length) setRides((q) => [...q, ...add].slice(-10));
          });
        }
      }
      // Removed by the owner or a moderator.
      if (me && !s.members.includes(me)) {
        const res = await enterRoom(roomId).catch(() => null);
        if (active && res && res !== "ok") handleEnter(res);
      }
    };
    load();
    const poll = setInterval(load, ROOM_POLL_MS);
    const beat = setInterval(() => { enterRoom(roomId).then((r) => active && r !== "ok" && handleEnter(r)).catch(() => {}); }, ROOM_HEARTBEAT_MS);
    const bye = () => { leaveRoom(roomId).catch(() => {}); };
    window.addEventListener("pagehide", bye);
    return () => { active = false; clearInterval(poll); clearInterval(beat); window.removeEventListener("pagehide", bye); };
  }, [inside, roomId, me, handleEnter]);

  // Video gifts: everyone inside checks for new ones; videos sent before you came in never replay.
  useEffect(() => {
    if (!inside || !roomId) return;
    let active = true;
    let busy = false;
    showsCursor.current = null;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const rows = await getGiftShows(roomId, showsCursor.current);
        if (!active) return;
        const { cursor, play } = nextGiftShows(showsCursor.current, rows);
        showsCursor.current = cursor;
        if (play.length) setVideoQueue((q) => [...q, ...play].slice(-10));
      } finally { busy = false; }
    };
    pollShows.current = () => { void check(); };
    void check();
    const t = setInterval(check, 2000);
    return () => { active = false; clearInterval(t); pollShows.current = () => {}; setVideoQueue([]); };
  }, [inside, roomId]);
  const shownVideo = videoQueue[0];

  // Leaving the page inside the app also leaves the room.
  useEffect(() => {
    if (!roomId) return;
    return () => { leaveRoom(roomId).catch(() => {}); };
  }, [roomId]);

  // My own entrance: a join line for me, and my bar first in line.
  useEffect(() => {
    if (!entrance || !me) return;
    setEntrance(false);
    const j = { key: `${me}-${Date.now()}`, auth_id: me, at: new Date().toISOString() };
    setJoins((x) => [...x, j]);
    if (activeVipLevel(profile) > 0) setEntrances((q) => [j, ...q]);
    const myName = profile?.display_name ?? "";
    void getWorn([me]).then((w) => { const ride = w[me]?.ride; if (ride) setRides((q) => [{ key: j.key, name: myName, ride }, ...q]); });
  }, [entrance, me, profile]);
  const shownRide = rides[0];
  // Frames worn by the people on the mics.
  const worn = useWorn(seats.map((x) => x.auth_id));
  // Entrance bars play one after another.
  const shownEntrance = entrances[0];
  useEffect(() => {
    if (!shownEntrance) return;
    const t = setTimeout(() => setEntrances((q) => q.slice(1)), 4500);
    return () => clearTimeout(t);
  }, [shownEntrance]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, joins.length, tab]);

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!roomId) return;
    const res = await enterRoom(roomId, password).catch(() => null);
    if (res === "wrong_password") { toast.error("كلمة السر غلط"); return; }
    if (res && handleEnter(res)) setEntrance(true);
  }

  async function onSeat(no: number) {
    if (!roomId || !me) return;
    if (isManager) { setSeatMenu(no); return; }
    await moveToSeat(no);
  }
  async function moveToSeat(no: number) {
    if (!roomId || !me || seatBusy) return;
    const sitter = seats.find((s) => s.seat_no === no);
    if (sitter) {
      if (sitter.auth_id === me) { setSeatMenu(null); await leaveSeat(roomId).catch(() => {}); setSeats((s) => s.filter((x) => x.auth_id !== me)); return; }
      const p = people[sitter.auth_id]; if (p) setPicked(p); return;
    }
    const res = await takeSeat(roomId, no).catch(() => null);
    if (res === "ok") setSeats((s) => [...s.filter((x) => x.auth_id !== me), { seat_no: no, auth_id: me }]);
    else toast.error(res === "locked" ? "المقعد ده مقفول" : res === "taken" ? "المايك ده اتاخد" : "مقدرتش تطلع على المايك");
    setSeatMenu(null);
  }

  async function seatAction(action: string, data: Record<string, unknown> = {}) {
    if (!roomId || seatBusy) return;
    setSeatBusy(true);
    try { await manageRoom(roomId, action, data); await refreshTools(); setSeatMenu(null); setInviteSeat(null); }
    catch { toast.error('الطلب ماتنفّذش؛ راجع صلاحياتك وتحديث أدوات الروم'); }
    finally { setSeatBusy(false); }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!roomId || !me || !text.trim() || sending || !tools.chat_enabled) return;
    setSending(true);
    try {
      const res = await sendRoomMessage(roomId, text);
      if (res !== "ok") throw new Error(res ?? "");
      setText("");
      const s = await getRoomState(roomId); setMessages(s.messages);
    } catch { toast.error("الرسالة ماتبعتتش"); }
    finally { setSending(false); }
  }

  async function onKick(p: RoomPerson) {
    if (!roomId) return;
    const res = await kickFromRoom(roomId, p.auth_id).catch(() => null);
    if (res === "ok") { toast.success(`${p.display_name} اتطرد من الروم لمدة 10 دقايق`); setPicked(null); await refreshTools(); }
    else toast.error("مش مسموح تطرد العضو ده");
  }

  async function onShare() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: room?.name ?? "voli", url });
      else { await navigator.clipboard.writeText(url); toast.success("اتنسخ لينك الروم"); }
    } catch { /* closed */ }
  }

  function openGifts(forIds: string[] = []) {
    setGiftFor(forIds);
    setPicked(null);
    setGiftOpen(true);
  }

  function onGiftSent(sent: GiftSent) {
    setCoins(sent.total);
    setGiftOpen(false);
    // A video gift plays for everyone (me included) through the room check; others fly the picture.
    if (sent.gift.video) pollShows.current();
    else setFlying({ ...sent, key: Date.now() });
    reload();
    if (roomId) getGiftsReceived(roomId).then(setReceived);
    const names = sent.to.length > 2 ? `${sent.to.length} أشخاص` : sent.to.map((p) => p.display_name).join(" و ");
    toast.success(`بعت ${sent.gift.name} ×${sent.quantity} لـ ${names}`);
  }
  useEffect(() => {
    if (!flying) return;
    const t = setTimeout(() => setFlying(null), 2600);
    return () => clearTimeout(t);
  }, [flying]);

  /** The gift box strip: people on the mics in seat order (not me), plus whoever it was opened for. */
  const giftTargets: GiftTarget[] = [...seats].sort((a, b) => a.seat_no - b.seat_no)
    .filter((x) => x.auth_id !== me && people[x.auth_id])
    .map((x) => ({ person: people[x.auth_id]!, seat: x.seat_no }));
  for (const id of giftFor) {
    if (id !== me && people[id] && !giftTargets.some((t) => t.person.auth_id === id)) giftTargets.push({ person: people[id]! });
  }

  async function exit(end: boolean) {
    if (roomId) await (end ? endParty() : leaveRoom(roomId)).catch(() => {});
    navigate({ to: "/" });
  }

  const theme = roomTheme(room?.theme);
  const myVip = activeVipLevel(profile);
  /** A VIP tier with its own picture gets the framed profile card; everyone else keeps the plain sheet. */
  const cardArt = picked ? vipProfileCardArt(activeVipLevel(picked)) : null;

  return (
    <div className="h-dvh overflow-hidden bg-muted md:p-8">
      <div className={`relative mx-auto flex h-full w-full max-w-md flex-col overflow-hidden text-on-media md:rounded-[2.5rem] md:border ${theme.className}`} style={roomThemeStyle(room?.theme)}>
        {status !== "inside" ? (
          <Gate status={status} isOwner={isOwner} password={password} setPassword={setPassword} onPassword={onPassword} />
        ) : room && owner ? (
          <>
            <header className="px-4 pt-4">
              <div className="flex items-center gap-3">
                {room.cover_url ? (
                  <img src={room.cover_url} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-overlay"><User className="size-6" /></span>
                )}
                <div className="min-w-0 flex-1 text-start">
                  <p className="flex items-center gap-1.5 font-bold">
                    {room.locked && <Lock className="size-3.5 shrink-0 opacity-70" aria-label="مقفول" />}
                    <span className="truncate">{room.name}</span>
                  </p>
                  <p className="text-xs opacity-80"><bdi dir="ltr">ID:{shownId(owner)}</bdi></p>
                </div>
                <Button variant="ghost" size="icon" aria-label="أدوات الروم" disabled={!toolsReady} onClick={() => { setToolsOpen(true); void refreshTools().catch(() => {}); }} className="rounded-full text-on-media hover:bg-overlay"><Settings className="size-5" /></Button>
                <Button variant="ghost" size="icon" aria-label="خروج" onClick={() => (isOwner ? setExitOpen(true) : exit(false))} className="rounded-full text-on-media hover:bg-overlay">
                  <Power className="size-6" />
                </Button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button type="button" onClick={() => setListOpen(true)} className="inline-flex items-center gap-1 rounded-full bg-overlay px-2.5 py-0.5 text-xs" aria-label={`${members.length} في الروم`}>
                  <span className="flex -space-x-1.5 rtl:space-x-reverse">
                    {members.slice(0, 3).map((id) => people[id] && <Avatar key={id} person={people[id]} className="size-5 text-[9px] ring-1 ring-on-media/40" />)}
                  </span>
                  <Users className="size-3.5" /> <span className="tabular-nums">{members.length}</span>
                </button>
                {/* The ranking opener takes the spot the owner label used to hold, at the end of the row. */}
                <button type="button" onClick={() => setRankOpen(true)}
                  className="relative inline-flex shrink-0 transition active:scale-95"
                  aria-label={`ترتيب الدعم والمدعومين — ${coins.toLocaleString("en")} كوينز مرمية في الروم`}>
                  <img src={trophyButton} alt="" className="block h-7 w-auto" />
                  {/* The shine is masked to the artwork itself, so it never spills past the gold frame. */}
                  <span aria-hidden className="rank-sweep pointer-events-none absolute inset-0"
                    style={{ WebkitMaskImage: `url(${trophyButton})`, maskImage: `url(${trophyButton})`, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" }} />
                  <span className="absolute inset-y-0 flex items-center justify-center gap-1 text-[10px] font-black tabular-nums text-rank-gold [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
                    style={{ left: "32%", right: "7%" }}>
                    <img src={coinIcon} alt="" className="size-2.5 shrink-0" />
                    {shortCoins(coins)}
                  </span>
                </button>
              </div>
            </header>

            <section aria-label="المايكات" className="grid grid-cols-5 gap-x-2 gap-y-3 px-4 pt-5">
              {Array.from({ length: room.seat_count }, (_, i) => i + 1).map((no) => {
                const sitter = seats.find((s) => s.seat_no === no);
                const p = sitter ? people[sitter.auth_id] : undefined;
                return (
                  <Button key={no} type="button" variant="ghost" onClick={() => onSeat(no)} className="h-auto min-w-0 flex-col gap-1 p-0 text-on-media hover:bg-transparent" aria-label={p ? `${p.display_name} على مايك ${no}` : `مايك ${no} ${tools.controls.some(c=>c.seat_no===no&&c.locked)?'مقفول':'فاضي'}`}>
                    {p ? (
                      <span className="relative">
                        {voice.speaking.has(p.auth_id) && <><span aria-hidden className="voice-ripple" /><span aria-hidden className="voice-ripple voice-ripple-late" /></>}
                        <HeadwearFrame art={worn[p.auth_id]?.frame?.art_url}>
                          <Avatar person={p} className={`relative size-14 ring-2 transition ${voice.speaking.has(p.auth_id) ? "ring-primary shadow-[0_0_12px_var(--color-primary)]" : sitter?.auth_id === me ? "ring-primary" : "ring-on-media/30"}`} />
                        </HeadwearFrame>
                        {(sitter?.auth_id === me && voice.muted) || tools.controls.some(c=>c.seat_no===no&&c.muted) && (
                          <span className="absolute -bottom-0.5 -end-0.5 z-20 grid size-5 place-items-center rounded-full bg-destructive text-destructive-foreground"><MicOff className="size-3" /></span>
                        )}
                      </span>
                    ) : (
                      <span className="grid size-14 place-items-center rounded-full border-2 border-on-media/15 bg-overlay">{tools.controls.some(c=>c.seat_no===no&&c.locked)?<Lock className="size-6 opacity-70"/>:<Mic className="size-6 opacity-70" />}</span>
                    )}
                    <span className="w-full truncate text-center text-xs opacity-80">{p ? p.display_name : no}</span>
                    {p && tools.admins.includes(p.auth_id) && <ShieldCheck className="size-3 text-primary" aria-label="أدمن الروم"/>}
                    {p && tools.show_charisma && (received[p.auth_id] ?? 0) > 0 && (
                      <span className="-mt-1 inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums opacity-90" aria-label={`استلم ${received[p.auth_id]} من الهدايا`}>
                        <img src={diamondIcon} alt="" className="size-2.5" />{shortCoins(received[p.auth_id]!)}
                      </span>
                    )}
                  </Button>
                );
              })}
            </section>

            {tools.invite && <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-overlay p-3 text-sm"><span className="min-w-0 flex-1">دعوة للمايك {tools.invite.seat_no}</span><Button size="sm" disabled={seatBusy} onClick={()=>seatAction('accept_invite')}>قبول</Button><Button size="icon" variant="ghost" disabled={seatBusy} aria-label="رفض الدعوة" onClick={()=>seatAction('decline_invite')}><X/></Button></div>}
            {/* Only the mobile audio-unlock tap stays up here; the mute control lives by the games. */}
            {voice.needsTap && (
              <div className="mt-3 flex justify-center gap-2 px-4">
                <button type="button" onClick={voice.startAudio} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground">
                  <Volume2 className="size-4" /> شغّل الصوت
                </button>
              </div>
            )}

            <nav className="mt-4 flex gap-5 px-4" aria-label="الدردشة">
              {([["all", "الكل"], ["chat", "الدردشة"]] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key}
                  className={`relative pb-2 text-base font-bold transition ${tab === key ? "" : "opacity-50"}`}>
                  {label}
                  {tab === key && <span className="absolute inset-x-1/3 bottom-0 h-1 rounded-full bg-on-media" />}
                </button>
              ))}
            </nav>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-2">
                  {tab === "all" && (
                    <>
                      <Card><p className="text-sm text-primary">مرحبًا بك في voli، يرجى الالتزام بمواصفات المنصة.</p></Card>
                      {room.announcement && (
                        <Card>
                          <p className="mb-1 text-xs font-bold opacity-70">إعلان الروم</p>
                          <p className="whitespace-pre-wrap break-words text-sm">{room.announcement}</p>
                        </Card>
                      )}
                      <Card className="flex items-center gap-3">
                        <p className="flex-1 text-sm">شارك الروم ده مع صحابك!</p>
                        <Button size="sm" onClick={onShare} className="rounded-full"><Share2 /> مشاركة</Button>
                      </Card>
                    </>
                  )}
                  {feed(messages, tab === "all" ? joins : []).map((item) => {
                    if ("auth_id" in item) {
                      const jp = people[item.auth_id];
                      return (
                        <p key={item.key} className="flex w-fit max-w-full items-center gap-1.5 rounded-full bg-overlay px-3 py-1 text-xs">
                          <span className={`truncate font-semibold ${vipTier(activeVipLevel(jp))?.text ?? ""}`}>{jp?.display_name ?? "…"}</span>
                          <VipBadge level={activeVipLevel(jp)} />
                          <span className="shrink-0 opacity-80">دخل الروم</span>
                        </p>
                      );
                    }
                    const m = item;
                    const p = people[m.sender_id];
                    const lvl = activeVipLevel(p);
                    return (
                      <div key={m.id} className="flex items-start gap-2">
                        {p && <Avatar person={p} className="size-8" />}
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1 text-xs">
                            <span className={`truncate font-semibold ${vipTier(lvl)?.text ?? "opacity-70"}`}>{p?.display_name ?? "…"}</span>
                            <VipBadge level={lvl} />
                          </p>
                          <ChatBubble level={lvl} body={m.body} />
                        </div>
                      </div>
                    );
                  })}
                  {tab === "chat" && messages.length === 0 && <p className="py-10 text-center text-sm opacity-70">مفيش رسايل لسه</p>}
                  <div ref={endRef} />
            </div>

            <form onSubmit={onSend} className="flex items-center gap-2 px-4 pb-4 pt-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-overlay px-4 py-2.5">
                <MessageCircle className="size-5 shrink-0 opacity-70" />
                <input disabled={!tools.chat_enabled} aria-label="اكتب في الروم" placeholder={tools.chat_enabled ? "قول حاجة…" : "الدردشة مقفولة"} value={text} maxLength={300} onChange={(e) => setText(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-on-media/50" />
              </label>
              {/* The mic switch sits with the games and gift buttons, so it is always within thumb reach. */}
              {iAmSeated && voice.connected && (
                <Button type="button" size="icon" variant="ghost" aria-label={voice.muted ? "تشغيل المايك" : "إيقاف المايك"}
                  aria-pressed={voice.muted} disabled={forcedMuted} title={forcedMuted?"المايك مقفول من إدارة الروم":undefined} onClick={voice.toggleMute}
                  className={`size-11 shrink-0 rounded-full ${voice.muted ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-overlay text-on-media"}`}>
                  {voice.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                </Button>
              )}
              {text.trim() ? (
                <Button type="submit" size="icon" aria-label="إرسال" disabled={sending} className="size-11 rounded-full">
                  {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal className="-scale-x-100" />}
                </Button>
              ) : (
                <>
                  <Button type="button" size="icon" variant="ghost" aria-label={voice.speakerOff ? "تشغيل صوت الروم" : "كتم صوت الروم"}
                    aria-pressed={voice.speakerOff} onClick={voice.toggleSpeaker}
                    className={`size-11 shrink-0 rounded-full ${voice.speakerOff ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-overlay text-on-media"}`}>
                    {voice.speakerOff ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                  </Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="الألعاب" onClick={() => setGamesOpen(true)} className="size-11 rounded-full bg-overlay text-on-media">
                    <Gamepad2 className="size-5" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="هدية" onClick={() => openGifts()} className="size-11 rounded-full bg-overlay text-on-media">
                    <Gift className="size-5" />
                  </Button>
                </>
              )}
            </form>

            {flying && (
              <div key={flying.key} className="pointer-events-none absolute inset-0 z-40 grid place-items-center">
                <div className="flex flex-col items-center animate-in zoom-in-50 fade-in duration-500">
                  <img src={flying.gift.art} alt="" className="size-44 object-contain drop-shadow-2xl" />
                  <p className="mt-1 rounded-full bg-overlay px-3 py-1 text-sm font-bold">{flying.gift.name} ×{flying.quantity}</p>
                </div>
              </div>
            )}

            {shownVideo && (
              <GiftVideo key={shownVideo.id} show={shownVideo}
                sender={shownVideo.sender_id ? (shownVideo.sender_id === me ? profile?.display_name : people[shownVideo.sender_id]?.display_name) ?? undefined : undefined}
                onDone={() => setVideoQueue((q) => q.filter((x) => x.id !== shownVideo.id))} />
            )}

            {shownRide && !shownVideo && (
              <RideEntrance key={shownRide.key} ride={shownRide.ride} name={shownRide.name}
                onDone={() => setRides((q) => q.filter((x) => x.key !== shownRide.key))} />
            )}

            {shownEntrance && (() => {
              const ep = shownEntrance.auth_id === me && profile ? { ...profile, vip: myVip } : people[shownEntrance.auth_id] && { ...people[shownEntrance.auth_id], vip: activeVipLevel(people[shownEntrance.auth_id]) };
              return ep && ep.vip > 0 ? (
                <div key={shownEntrance.key} className="pointer-events-none absolute inset-x-0 top-1/3 px-3">
                  <VipEntrance level={ep.vip} name={ep.display_name ?? ""} />
                </div>
              ) : null;
            })()}
          </>
        ) : null}
      </div>

      {picked && cardArt ? (
        <Sheet open onOpenChange={(o) => !o && setPicked(null)}>
          <SheetContent side="bottom" className="w-full max-w-none gap-0 border-0 bg-transparent p-0 shadow-none [&>button]:hidden">
            <SheetTitle className="sr-only">ملف {picked.display_name}</SheetTitle>
            <div className="relative mx-auto w-full max-w-[calc(70dvh*0.866)]">
              <button type="button" onClick={() => setPicked(null)} aria-label="إغلاق"
                className="absolute -top-11 right-0 grid size-8 place-items-center rounded-full bg-overlay text-on-media">
                <X className="size-4" />
              </button>
              <VipProfileCard art={cardArt}
                avatar={<Avatar person={picked} className="size-full text-3xl" />}
                name={picked.display_name}
                subCard={
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xs text-on-media/80" dir="ltr">ID:{shownId(picked)}</span>
                    <VipBadge level={activeVipLevel(picked)} />
                  </div>
                } />
            </div>
            <div className="mx-auto flex w-full max-w-md items-center gap-2 rounded-t-2xl bg-background px-3 py-2.5">
              <Button asChild size="sm" className="h-9 flex-1 rounded-full bg-rank-gold font-bold text-vip-on hover:bg-rank-gold/90">
                <Link to="/user/$publicId" params={{ publicId: String(picked.public_id) }}>الملف الشخصي</Link>
              </Button>
              {picked.auth_id !== me && (
                <Button size="sm" onClick={() => openGifts([picked.auth_id])} className="h-9 flex-1 rounded-full"><Gift /> هدية</Button>
              )}
              {isManager && picked.auth_id !== me && picked.auth_id !== owner?.auth_id && (
                <Button size="sm" variant="destructive" onClick={() => onKick(picked)} className="h-9 flex-1 rounded-full">طرد من الروم</Button>
              )}
            </div>
            {picked && <div className="mx-auto flex w-full max-w-md flex-wrap gap-2 bg-background px-3 pb-3">
              {picked.auth_id !== me && <Button asChild size="sm" variant="secondary"><Link to="/chat/$publicId" params={{publicId:String(picked.public_id)}}>دردشة خاصة</Link></Button>}
              {isOwner && picked.auth_id !== me && <Button size="sm" variant="secondary" disabled={seatBusy} onClick={()=>seatAction('admin',{target:picked.auth_id,enabled:!tools.admins.includes(picked.auth_id)})}><ShieldCheck/>{tools.admins.includes(picked.auth_id)?'سحب الأدمن':'تعيين أدمن'}</Button>}
              {isManager && picked.auth_id !== me && picked.auth_id !== owner?.auth_id && <Button size="sm" variant="destructive" disabled={seatBusy} onClick={()=>{void seatAction('blacklist',{target:picked.auth_id});setPicked(null);}}><Ban/>حظر</Button>}
            </div>}
          </SheetContent>
        </Sheet>
      ) : (
        <Sheet open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
          <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-3xl">
            {picked && (
              <>
                <SheetHeader className="items-center text-center">
                  <Avatar person={picked} className="size-16" />
                  <SheetTitle className="flex items-center gap-1.5">{picked.display_name} <VipBadge level={activeVipLevel(picked)} /></SheetTitle>
                  <p className="text-xs text-muted-foreground" dir="ltr">ID:{shownId(picked)}</p>
                </SheetHeader>
                <div className="grid gap-2 p-4">
                  {isOwner && picked.auth_id !== me && <Button variant="secondary" disabled={seatBusy} onClick={()=>seatAction('admin',{target:picked.auth_id,enabled:!tools.admins.includes(picked.auth_id)})}><ShieldCheck/>{tools.admins.includes(picked.auth_id)?'سحب الأدمن':'تعيين أدمن'}</Button>}
                  {isManager && picked.auth_id !== me && picked.auth_id !== owner?.auth_id && <Button variant="destructive" disabled={seatBusy} onClick={()=>{void seatAction('blacklist',{target:picked.auth_id});setPicked(null);}}><Ban/>حظر من الروم</Button>}
                  {picked.auth_id !== me && <Button asChild variant="secondary"><Link to="/chat/$publicId" params={{publicId:String(picked.public_id)}}>دردشة خاصة</Link></Button>}
                  <Button asChild variant="secondary" className="h-12 rounded-full">
                    <Link to="/user/$publicId" params={{ publicId: String(picked.public_id) }}>الملف الشخصي</Link>
                  </Button>
                  {picked.auth_id !== me && (
                    <Button onClick={() => openGifts([picked.auth_id])} className="h-12 rounded-full"><Gift /> ابعت هدية</Button>
                  )}
                  {isManager && picked.auth_id !== me && picked.auth_id !== owner?.auth_id && (
                    <Button variant="destructive" onClick={() => onKick(picked)} className="h-12 rounded-full">طرد من الروم</Button>
                  )}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      )}

      {room && me && <RoomTools room={room} me={me} people={people} members={members} state={tools} owner={isOwner} manager={isManager} open={toolsOpen} onOpenChange={setToolsOpen} onRefresh={refreshTools} onShare={onShare} onGifts={()=>openGifts()} onPick={p=>navigate({to:'/chat/$publicId',params:{publicId:String(p.public_id)}})} voiceConnected={voice.connected} needsTap={voice.needsTap} startAudio={voice.startAudio}/>}
      <SeatMenu seat={seatMenu} control={tools.controls.find(c=>c.seat_no===seatMenu)??{locked:false,muted:false}} occupied={seats.some(s=>s.seat_no===seatMenu)} mine={seats.some(s=>s.seat_no===seatMenu&&s.auth_id===me)} busy={seatBusy} onClose={()=>setSeatMenu(null)} onMove={()=>{if(seatMenu!==null)void moveToSeat(seatMenu);}} onInvite={()=>{setInviteSeat(seatMenu);setSeatMenu(null);}} onAction={(action,enabled)=>seatAction(action,{seat:seatMenu,enabled})} onProfile={()=>{const seat=seats.find(s=>s.seat_no===seatMenu);const person=seat?people[seat.auth_id]:undefined;if(person)setPicked(person);setSeatMenu(null);}}/>
      <Sheet open={inviteSeat!==null} onOpenChange={o=>!o&&setInviteSeat(null)}><SheetContent side="bottom" className="mx-auto max-h-[70dvh] max-w-md overflow-y-auto rounded-t-lg" dir="rtl"><SheetTitle>دعوة للمايك {inviteSeat}</SheetTitle><div className="mt-4 grid gap-2">{members.filter(id=>id!==me).map(id=>{const p=people[id];return p?<Button key={id} variant="secondary" disabled={seatBusy} className="h-12 justify-between" onClick={()=>seatAction('invite',{seat:inviteSeat,target:id})}><span className="truncate">{p.display_name}</span><Mic/></Button>:null;})}{members.filter(id=>id!==me).length===0&&<p className="text-sm text-muted-foreground">مفيش أعضاء تانيين في الروم</p>}</div></SheetContent></Sheet>

      <RoomViewers open={listOpen} onOpenChange={setListOpen} members={members} people={people} ownerId={owner?.auth_id}
        seated={new Set(seats.map((x) => x.auth_id))} me={me} onPick={(p) => { setListOpen(false); setPicked(p); }} />

      <RoomRanking open={rankOpen} onOpenChange={setRankOpen} roomId={roomId} />

      {roomId && (
        <GiftSheet open={giftOpen} onOpenChange={setGiftOpen} roomId={roomId} targets={giftTargets} preselect={giftFor}
          balance={balance} wealthPoints={Number(profile?.wealth_points ?? 0)} onSent={onGiftSent} />
      )}

      {roomId && (
        <RoomGames open={gamesOpen} onOpenChange={setGamesOpen} roomId={roomId}
          onPlayed={() => { getRoomState(roomId).then((s) => setMessages(s.messages)).catch(() => {}); }} />
      )}

      <Sheet open={exitOpen} onOpenChange={setExitOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-3xl">
          <SheetHeader><SheetTitle>خروج من الروم</SheetTitle></SheetHeader>
          <div className="grid gap-2 p-4">
            <Button variant="destructive" onClick={() => exit(true)} className="h-12 rounded-full">إنهاء الحفلة</Button>
            <Button variant="secondary" onClick={() => exit(false)} className="h-12 rounded-full">خروج والحفلة شغالة</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

type Join = { key: string; auth_id: string; at: string };

/** Chat messages and "came in" lines in time order. */
function feed(messages: RoomMessage[], joins: Join[]): (RoomMessage | Join)[] {
  const time = (x: RoomMessage | Join) => ("auth_id" in x ? x.at : x.created_at);
  return [...messages, ...joins].sort((a, b) => time(a).localeCompare(time(b)));
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-overlay px-4 py-3 ${className}`}>{children}</div>;
}

function Avatar({ person, className = "" }: { person: RoomPerson; className?: string }) {
  return person.avatar_url ? (
    <img src={person.avatar_url} alt="" className={`shrink-0 rounded-full object-cover ${className}`} />
  ) : (
    <span className={`grid shrink-0 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground ${className}`}>
      {person.display_name.trim().charAt(0) || "؟"}
    </span>
  );
}

function Gate({ status, isOwner, password, setPassword, onPassword }: {
  status: Status; isOwner: boolean; password: string; setPassword: (v: string) => void; onPassword: (e: React.FormEvent) => void;
}) {
  const back = (
    <Button asChild variant="secondary" className="rounded-full"><Link to="/">الرئيسية</Link></Button>
  );
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      {status === "loading" && <Loader2 className="size-8 animate-spin" aria-label="جاري الدخول" />}
      {status === "password" && (
        <form onSubmit={onPassword} className="w-full space-y-3">
          <Lock className="mx-auto size-10" />
          <p className="font-bold">الروم ده مقفول</p>
          <input aria-label="كلمة سر الروم" inputMode="numeric" dir="ltr" maxLength={8} autoFocus value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, ""))} placeholder="كلمة السر"
            className="w-full rounded-2xl bg-overlay px-4 py-3 text-center text-lg tracking-[0.4em] outline-none" />
          <Button type="submit" className="h-12 w-full rounded-full">دخول</Button>
          {back}
        </form>
      )}
      {status === "offline" && (
        <>
          <p className="font-bold">الحفلة مش شغالة دلوقتي</p>
          {isOwner ? <Button asChild className="rounded-full"><Link to="/room/new">ابدأ الحفلة</Link></Button> : back}
        </>
      )}
      {status === "missing" && (<><p className="font-bold">مفيش روم بالـ ID ده</p>{back}</>)}
      {status === "kicked" && (<><p className="font-bold">اتطردت من الروم ده، تقدر ترجع بعد شوية</p>{back}</>)}
      {status === "error" && (<><p className="font-bold">الروم مافتحش. اتأكد إن تحديث الرومات اتشغّل في قاعدة البيانات</p>{back}</>)}
    </div>
  );
}

/** Room chat bubble: VIP tiers with their own picture get a stretchable framed bubble. */
function ChatBubble({ level, body }: { level: number; body: string }) {
  const art = vipChatBubbleArt(level);
  if (!art) {
    return <p className="mt-0.5 inline-block whitespace-pre-wrap break-words rounded-2xl rounded-ss-sm bg-overlay px-3 py-1.5 text-sm">{body}</p>;
  }
  const { slice: s, border: b } = art;
  return (
    <p
      className="vip-bubble-shine mt-0.5 box-border inline-block min-h-11 min-w-20 max-w-full whitespace-pre-wrap [overflow-wrap:anywhere] text-sm text-vip-bubble-foreground"
      style={{
        borderStyle: "solid",
        borderWidth: `${b.top}px ${b.right}px ${b.bottom}px ${b.left}px`,
        borderImage: `url(${art.url}) ${s.top} ${s.right} ${s.bottom} ${s.left} fill / ${b.top}px ${b.right}px ${b.bottom}px ${b.left}px stretch`,
        padding: "4px 10px",
        textShadow: "0 1px 2px var(--vip-bubble-shadow)",
      }}
    >
      {body}
    </p>
  );
}
