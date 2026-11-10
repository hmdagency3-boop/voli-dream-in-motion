import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { z } from "zod";

const SUPABASE_URL = "https://eyewvtgszwrrzgfbrumr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ihbqq5bV6PGzxeyoGM02Jw_52nGsCn7";

/**
 * Hands a LiveKit voice ticket to a member who is inside a live room.
 * Only members sitting on a seat may talk; everyone else inside only listens.
 */
export const getVoiceToken = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ roomId: z.string().uuid(), accessToken: z.string().min(10) }).parse(input))
  .handler(async ({ data }) => {
    const url = process.env['LIVEKIT_URL'];
    const key = process.env['LIVEKIT_API_KEY'];
    const secret = process.env['LIVEKIT_API_SECRET'];
    if (!url || !key || !secret) throw new Error("voice_not_configured");

    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
    });
    const { data: u, error } = await db.auth.getUser(data.accessToken);
    if (error || !u.user) throw new Error("not_signed_in");
    const me = u.user.id;

    const since = new Date(Date.now() - 60_000).toISOString();
    const [room, member, seat, tools] = await Promise.all([
      db.from("rooms").select("id, is_live").eq("id", data.roomId).maybeSingle(),
      db.from("room_members").select("auth_id").eq("room_id", data.roomId).eq("auth_id", me).gt("last_seen", since).maybeSingle(),
      db.from("room_seats").select("seat_no").eq("room_id", data.roomId).eq("auth_id", me).maybeSingle(),
      db.rpc("room_tools_state", { p_room: data.roomId }),
    ]);
    if (!room.data?.is_live) throw new Error("room_not_live");
    if (!member.data) throw new Error("not_inside");
    if (tools.error) throw new Error('room_tools_not_configured');
    const controls = (tools.data as { controls: { seat_no: number; muted: boolean }[] }).controls;
    const canTalk = !!seat.data && !controls.some(c => c.seat_no === seat.data?.seat_no && c.muted);

    const token = await new SignJWT({
      video: {
        room: data.roomId, roomJoin: true, canSubscribe: true,
        canPublish: canTalk, canPublishSources: canTalk ? ["microphone"] : [], canPublishData: false,
      },
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(key)
      .setSubject(me)
      .setNotBefore(Math.floor(Date.now() / 1000) - 10)
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(secret));

    return { url, token, canTalk };
  });

/** Reconcile active provider permissions using verified room authority and stored state only. */
export const syncRoomVoice = createServerFn({ method: 'POST' })
  .inputValidator(input => z.object({ roomId: z.string().uuid(), accessToken: z.string().min(10) }).parse(input))
  .handler(async ({ data }) => {
    const url = process.env['LIVEKIT_URL'];
    const key = process.env['LIVEKIT_API_KEY'];
    const secret = process.env['LIVEKIT_API_SECRET'];
    if (!url || !key || !secret) throw new Error('voice_not_configured');
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
    });
    const user = await db.auth.getUser(data.accessToken);
    if (user.error || !user.data.user) throw new Error('not_signed_in');
    const [tools, room, seats, members] = await Promise.all([
      db.rpc('room_tools_state', { p_room: data.roomId }),
      db.from('rooms').select('owner_id,is_live').eq('id', data.roomId).maybeSingle(),
      db.from('room_seats').select('auth_id,seat_no').eq('room_id', data.roomId),
      db.from('room_members').select('auth_id').eq('room_id', data.roomId).gt('last_seen', new Date(Date.now()-60000).toISOString()),
    ]);
    if (tools.error || seats.error || members.error || !room.data?.is_live) throw new Error('not_inside');
    const state = tools.data as { admins: string[]; controls: { seat_no: number; muted: boolean }[] };
    const me = user.data.user.id;
    if (room.data.owner_id !== me && !state.admins.includes(me)) throw new Error('not_allowed');
    const token = await new SignJWT({ video: { room: data.roomId, roomAdmin: true } })
      .setProtectedHeader({ alg: 'HS256' }).setIssuer(key).setSubject(me).setExpirationTime('1m')
      .sign(new TextEncoder().encode(secret));
    const endpoint = url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '');
    async function rpc(method: string, body: object) {
      const res = await fetch(`${endpoint}/twirp/livekit.RoomService/${method}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('voice_sync_failed');
      return res.json() as Promise<{ participants?: { identity: string }[] }>;
    }
    const list = await rpc('ListParticipants', { room: data.roomId });
    await Promise.all((list.participants ?? []).map(async participant => {
      if (!members.data?.some(m => m.auth_id === participant.identity)) {
        await rpc('RemoveParticipant', { room: data.roomId, identity: participant.identity }); return;
      }
      const seat = seats.data?.find(s => s.auth_id === participant.identity);
      const canPublish = !!seat && !state.controls.some(c => c.seat_no === seat.seat_no && c.muted);
      await rpc('UpdateParticipant', { room: data.roomId, identity: participant.identity,
        permission: { canSubscribe: true, canPublish, canPublishData: false, canPublishSources: canPublish ? [2] : [] },
      });
    }));
    return { ok: true };
  });
