import { supabase } from '@/lib/supabase';

export type ChatPartner = {
  auth_id: string; public_id: number; display_name: string; avatar_url: string | null;
  vip_level?: number; vip_expires_at?: string | null;
};
export type Message = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null };

/** Finds the member to chat with by their normal public ID. */
export async function getPartnerByPublicId(publicId: number): Promise<ChatPartner | null> {
  // Databases without the VIP update (003) miss the VIP columns: fall back to the basic ones.
  let res = await supabase
    .from('profiles').select('auth_id, public_id, display_name, avatar_url, vip_level, vip_expires_at').eq('public_id', publicId).maybeSingle();
  if (res.error) {
    res = await supabase
      .from('profiles').select('auth_id, public_id, display_name, avatar_url').eq('public_id', publicId).maybeSingle();
  }
  if (res.error) throw res.error;
  return (res.data as ChatPartner | null) ?? null;
}

/** Messages between the signed-in member and one partner, oldest first. RLS limits rows to the member's own. */
export async function getConversation(me: string, other: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, recipient_id, body, created_at, read_at')
    .or(`and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(me: string, other: string, body: string) {
  const text = body.trim();
  if (!text) return;
  const { error } = await supabase.from('messages').insert({ sender_id: me, recipient_id: other, body: text.slice(0, 4000) });
  if (error) throw error;
}

export async function markRead(me: string, other: string) {
  await supabase.from('messages').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', me).eq('sender_id', other).is('read_at', null);
}

export type ConversationSummary = { partner: ChatPartner; last: Message; unread: number };

/** Public ID of Voli Helper, the official management notices account (supabase/010_admin_notices.sql). */
export const ADMIN_NOTICE_ID = 100;
export const isAdminNotice = (publicId: number | string | undefined) => Number(publicId) === ADMIN_NOTICE_ID;

/** One row of the chat list. The Voli Helper row may have no message yet. */
export type ChatListItem = { partner: ChatPartner | null; last: Message | null; unread: number; pinned: boolean };

/**
 * Chat list order: Voli Helper is always pinned first (even with no notices yet, or when its
 * account is missing from this database), then everyone else by their latest message.
 */
export function pinAdminNotices(conversations: ConversationSummary[], helper: ChatPartner | null): ChatListItem[] {
  const own = conversations.find((c) => isAdminNotice(c.partner.public_id));
  const pinned: ChatListItem = own
    ? { ...own, pinned: true }
    : { partner: helper, last: null, unread: 0, pinned: true };
  const rest = conversations
    .filter((c) => !isAdminNotice(c.partner.public_id))
    .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at))
    .map((c) => ({ ...c, pinned: false }));
  return [pinned, ...rest];
}

/** Members the signed-in member follows who follow them back. */
export async function getFriendIds(me: string): Promise<Set<string>> {
  const [mine, theirs] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', me),
    supabase.from('follows').select('follower_id').eq('following_id', me),
  ]);
  if (mine.error || theirs.error) return new Set();
  const back = new Set((theirs.data ?? []).map((r: { follower_id: string }) => r.follower_id));
  return new Set((mine.data ?? []).map((r: { following_id: string }) => r.following_id).filter((id) => back.has(id)));
}

/** Latest message per partner for the chat list. */
export async function getConversations(me: string): Promise<ConversationSummary[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, recipient_id, body, created_at, read_at')
    .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  const byPartner = new Map<string, { last: Message; unread: number }>();
  for (const m of (data ?? []) as Message[]) {
    const other = m.sender_id === me ? m.recipient_id : m.sender_id;
    const entry = byPartner.get(other) ?? { last: m, unread: 0 };
    if (m.recipient_id === me && !m.read_at) entry.unread++;
    byPartner.set(other, entry);
  }
  if (!byPartner.size) return [];
  const ids = [...byPartner.keys()];
  // Databases without the VIP update (003) miss the VIP columns: fall back to the basic ones.
  let res: { data: unknown[] | null; error: unknown } = await supabase
    .from('profiles').select('auth_id, public_id, display_name, avatar_url, vip_level, vip_expires_at').in('auth_id', ids);
  if (res.error) res = await supabase.from('profiles').select('auth_id, public_id, display_name, avatar_url').in('auth_id', ids);
  const { data: profiles, error: pErr } = res;
  if (pErr) throw pErr;
  return ((profiles ?? []) as ChatPartner[])
    .map((partner) => ({ partner, ...byPartner.get(partner.auth_id)! }))
    .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
}
