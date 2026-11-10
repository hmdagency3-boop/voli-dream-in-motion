import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getVoiceToken } from "@/lib/voice.functions";

/**
 * Room voice over LiveKit. Everyone inside listens; members on a seat talk.
 * Reconnects whenever the seat changes so the server decides who may speak.
 */
export function useRoomVoice(roomId: string | undefined, inside: boolean, seated: boolean, forcedMuted = false) {
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [connected, setConnected] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const roomRef = useRef<import("livekit-client").Room | null>(null);
  // Every voice playing in the room, so the room-sound switch can silence all of them at once.
  const audiosRef = useRef(new Map<string, HTMLMediaElement>());
  const speakerOffRef = useRef(false);

  useEffect(() => {
    if (!roomId || !inside) return;
    let cancelled = false;
    const audios = audiosRef.current;
    (async () => {
      const lk = await import("livekit-client");
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken || cancelled) return;
      let ticket: { url: string; token: string; canTalk: boolean };
      try { ticket = await getVoiceToken({ data: { roomId, accessToken } }); } catch { return; }
      if (cancelled) return;
      const room = new lk.Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room
        .on(lk.RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind !== lk.Track.Kind.Audio) return;
          const el = track.attach();
          el.style.display = "none";
          el.muted = speakerOffRef.current;
          document.body.appendChild(el);
          audios.set(`${participant.identity}:${track.sid}`, el);
        })
        .on(lk.RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
          const k = `${participant.identity}:${track.sid}`;
          track.detach().forEach((e) => e.remove());
          audios.delete(k);
        })
        .on(lk.RoomEvent.ActiveSpeakersChanged, (ps) => setSpeaking(new Set(ps.map((p) => p.identity))))
        .on(lk.RoomEvent.AudioPlaybackStatusChanged, () => setNeedsTap(!room.canPlaybackAudio))
        .on(lk.RoomEvent.Disconnected, () => setConnected(false));
      try {
        await room.connect(ticket.url, ticket.token);
        if (cancelled) { room.disconnect(); return; }
        setConnected(true);
        setNeedsTap(!room.canPlaybackAudio);
        if (ticket.canTalk) {
          await room.localParticipant.setMicrophoneEnabled(true).catch(() => {});
          setMuted(false);
        }
      } catch { /* voice is optional; the room still works */ }
    })();
    return () => {
      cancelled = true;
      roomRef.current?.disconnect();
      roomRef.current = null;
      audios.forEach((e) => e.remove());
      audios.clear();
      setConnected(false);
      setSpeaking(new Set());
    };
  }, [roomId, inside, seated, forcedMuted]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room || forcedMuted) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next).catch(() => {});
    setMuted(next);
  }, [muted, forcedMuted]);

  /** Silences (or brings back) everything heard from the room, for this listener only. */
  const toggleSpeaker = useCallback(() => {
    const next = !speakerOffRef.current;
    speakerOffRef.current = next;
    audiosRef.current.forEach((e) => { e.muted = next; });
    setSpeakerOff(next);
  }, []);

  const startAudio = useCallback(async () => {
    await roomRef.current?.startAudio().catch(() => {});
    setNeedsTap(!(roomRef.current?.canPlaybackAudio ?? true));
  }, []);

  return { speaking, muted: muted || forcedMuted, toggleMute, speakerOff, toggleSpeaker, needsTap, startAudio, connected };
}
