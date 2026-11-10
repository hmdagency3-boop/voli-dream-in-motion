import { supabase } from '@/lib/supabase';

/** Gender, country (supabase/020), birthday and album (supabase/021) of a member. */
export type Gender = 'male' | 'female';
export type ProfileInfo = {
  gender: Gender | null; country: string | null; country_hidden: boolean;
  /** YYYY-MM-DD, only ever returned to the member themself. */
  birthday: string | null;
  /** Age in whole years from the birthday (supabase/022), seen by everyone. */
  age: number | null;
  /** Up to ALBUM_MAX picture addresses, in display order. */
  album: string[];
};

export const ALBUM_MAX = 5;
export const NAME_MAX = 60;
export const BIO_MAX = 300;

export const GENDER_LABEL: Record<Gender, string> = { male: 'ذكر', female: 'أنثى' };

/** Arab countries are listed first in the picker. */
const ARAB = ['EG', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'YE', 'IQ', 'JO', 'PS', 'LB', 'SY', 'LY', 'TN', 'DZ', 'MA', 'MR', 'SD', 'SO', 'DJ', 'KM'];
const OTHERS = (
  'AF AL AD AO AG AR AM AU AT AZ BS BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO CG CD CR CI HR CU CY CZ ' +
  'DK DM DO EC SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IE IT JM JP KZ KE KI XK KG LA LV ' +
  'LS LR LI LT LU MO MG MW MY MV ML MT MH MU MX FM MD MC MN ME MZ MM NA NR NP NL NZ NI NE NG KP MK NO PK PW PA PG PY PE PH PL PT PR ' +
  'RO RU RW KN LC VC WS SM ST SN RS SC SL SG SK SI SB ZA KR SS ES LK SR SE CH TW TJ TZ TH TL TG TO TT TR TM TV UG UA GB US UY UZ VU ' +
  'VA VE VN ZM ZW'
).split(' ');

let names: Intl.DisplayNames | null = null;
/** Arabic country name for a two-letter code, e.g. EG → مصر. */
export function countryName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(['ar'], { type: 'region' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Flag emoji for a two-letter code, e.g. EG → 🇪🇬. */
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Round (1:1) flag pictures bundled with the app, keyed by lower-case country code. */
const FLAG_FILES = import.meta.glob('/node_modules/flag-icons/flags/1x1/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const FLAGS: Record<string, string> = Object.fromEntries(
  Object.entries(FLAG_FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]),
);

/** Picture of a country's flag, or null when none is bundled. */
export function countryFlagUrl(code: string): string | null {
  return FLAGS[code.toLowerCase()] ?? null;
}

/** All countries for the picker: Arab countries first, then the rest by Arabic name. */
export function countryOptions(): { code: string; name: string }[] {
  const rest = OTHERS.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  return [...ARAB.map((code) => ({ code, name: countryName(code) })), ...rest];
}

/** Pictures behind the profile's big cover: the album, or the avatar when the album is empty. */
export function coverPictures(album: readonly string[], avatar: string | null | undefined): string[] {
  if (album.length) return album.slice(0, ALBUM_MAX);
  return avatar ? [avatar] : [];
}

/** How long each album picture stays on the cover before the next one slides in. */
export const COVER_SLIDE_MS = 4000;

/** Whole years from a YYYY-MM-DD birthday to today (or the given day); null for a bad or future date. */
export function ageFrom(birthday: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthday);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ty = today.getFullYear(), tm = today.getMonth() + 1, td = today.getDate();
  const age = ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
  return age >= 0 && age < 150 ? age : null;
}

/** Gender and country of a member; null when the database update has not been run yet. */
export async function loadProfileInfo(authId: string): Promise<ProfileInfo | null> {
  const { data, error } = await supabase.rpc('profile_info', { p_auth: authId });
  if (error || !data) return null;
  const d = data as Partial<ProfileInfo>;
  return {
    gender: d.gender === 'male' || d.gender === 'female' ? d.gender : null,
    country: typeof d.country === 'string' ? d.country : null,
    country_hidden: !!d.country_hidden,
    birthday: typeof d.birthday === 'string' ? d.birthday.slice(0, 10) : null,
    // Before update 022 only the member's own birthday comes back, so work their age out here.
    age: typeof d.age === 'number' ? d.age : typeof d.birthday === 'string' ? ageFrom(d.birthday) : null,
    album: Array.isArray(d.album) ? d.album.filter((u): u is string => typeof u === 'string').slice(0, ALBUM_MAX) : [],
  };
}

/** Save my own gender and country. */
export async function saveMyProfileInfo(gender: Gender | null, country: string | null) {
  const { error } = await supabase.rpc('set_my_profile_info', { p_gender: gender, p_country: country });
  if (error) throw error;
}

/** Save my own birthday (YYYY-MM-DD, or null to clear). */
export async function saveMyBirthday(birthday: string | null) {
  const { error } = await supabase.rpc('set_my_birthday', { p_birthday: birthday });
  if (error) throw error;
}

/** Replace my album with these picture addresses (at most ALBUM_MAX). */
export async function saveMyAlbum(urls: string[]) {
  const { error } = await supabase.rpc('set_my_album', { p_urls: urls.slice(0, ALBUM_MAX) });
  if (error) throw error;
}

/** Upload one album picture and return its address. */
export async function uploadAlbumPicture(file: File): Promise<string> {
  const { uploadToCloudinary } = await import('@/lib/cloudinary');
  return uploadToCloudinary(file, 'voli/album');
}

/** Trimmed name, or an Arabic reason it can't be saved. */
export function checkName(name: string): { ok: true; value: string } | { ok: false; reason: string } {
  const value = name.trim();
  if (!value) return { ok: false, reason: 'اكتب اسمك' };
  if (value.length > NAME_MAX) return { ok: false, reason: `الاسم لازم يكون ${NAME_MAX} حرف أو أقل` };
  return { ok: true, value };
}

/** Save my own name; a management lock comes back as 'locked'. */
export async function saveMyName(authId: string, name: string): Promise<'ok' | 'locked'> {
  const { error } = await supabase.from('profiles').update({ display_name: name }).eq('auth_id', authId);
  if (error && (error as { hint?: string }).hint === 'name_locked') return 'locked';
  if (error) throw error;
  return 'ok';
}

/** Save my own bio (empty clears it). */
export async function saveMyBio(authId: string, bio: string) {
  const value = bio.trim().slice(0, BIO_MAX);
  const { error } = await supabase.from('profiles').update({ bio: value || null }).eq('auth_id', authId);
  if (error) throw error;
}

/** My current bio. */
export async function loadMyBio(authId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('bio').eq('auth_id', authId).maybeSingle();
  return (data as { bio: string | null } | null)?.bio ?? '';
}
