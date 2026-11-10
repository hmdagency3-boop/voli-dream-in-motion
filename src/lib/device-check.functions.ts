import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const SUPABASE_URL = "https://eyewvtgszwrrzgfbrumr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ihbqq5bV6PGzxeyoGM02Jw_52nGsCn7";

export type DeviceBan = { kind: string; until: string | null; reason: string | null; ban_code: number | null };

const s = (n: number) => z.string().max(n).optional().default("");

/** Records this app open (real IP read on the server) and returns a device/network ban if one applies. */
export const deviceCheckIn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      deviceId: z.string().min(8).max(100),
      platform: s(50), model: s(100), brand: s(100), osVersion: s(50), connection: s(30),
    }).parse(input),
  )
  .handler(async ({ data }): Promise<DeviceBan | null> => {
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-real-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY };
    const authorization = getRequestHeader('authorization');
    if (authorization?.startsWith('Bearer ')) headers['Authorization'] = authorization;
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers, fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (h.get('Authorization') === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`) h.delete('Authorization');
        h.set('apikey', SUPABASE_PUBLISHABLE_KEY);
        return fetch(input, { ...init, headers: h });
      } },
    });
    const { data: rows, error } = await db.rpc("device_check_in", {
      p_device_id: data.deviceId, p_ip: ip, p_country: getRequestHeader("cf-ipcountry") ?? "",
      p_user_agent: getRequestHeader("user-agent") ?? "", p_platform: data.platform, p_model: data.model,
      p_brand: data.brand, p_os_version: data.osVersion, p_connection: data.connection,
    });
    if (error) return null; // SQL not applied yet: never lock people out
    const row = (rows as (DeviceBan & { banned: boolean })[] | null)?.[0];
    return row?.banned ? { kind: row.kind, until: row.until, reason: row.reason, ban_code: row.ban_code ?? null } : null;
  });
