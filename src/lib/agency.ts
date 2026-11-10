import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getPeople, type RoomPerson } from '@/lib/rooms';

/** Agency system (supabase/008_agencies.sql). Every change goes through database functions. */

export type Agency = { id: string; code: number; name: string; owner_id: string; commission_percent: number | null; created_at: string };
export type Application = {
  id: string; agency_name: string; status: 'pending' | 'approved' | 'rejected';
  reject_reason: string | null; created_at: string; agency_id: string | null;
};
export type JoinRequest = { id: string; agency_id: string; host_id: string; status: 'pending' | 'accepted' | 'rejected' | 'cancelled'; created_at: string };
export type FoundAgency = { id: string; code: number; name: string; owner_id: string; members: number; owner?: RoomPerson | undefined };

export type AgencyState =
  | { kind: 'missing' }
  | { kind: 'agent'; agency: Agency }
  | { kind: 'host'; agency: Agency; owner?: RoomPerson | undefined; joined_at: string }
  | { kind: 'none'; application: Application | null; request: (JoinRequest & { agency?: FoundAgency }) | null };

const missing = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || code === '42883';
const AGENCY_COLS = 'id, code, name, owner_id, commission_percent, created_at';

/** Where the signed-in member stands: agent, host, or neither (with any waiting request). */
export async function getAgencyState(me: string): Promise<AgencyState> {
  const own = await supabase.from('agencies').select(AGENCY_COLS).eq('owner_id', me).maybeSingle();
  if (own.error) { if (missing(own.error.code)) return { kind: 'missing' }; throw own.error; }
  if (own.data) return { kind: 'agent', agency: normAgency(own.data) };

  const stay = await supabase.from('agency_members').select('agency_id, joined_at').eq('host_id', me).is('left_at', null).maybeSingle();
  if (stay.error) throw stay.error;
  if (stay.data) {
    const g = await supabase.from('agencies').select(AGENCY_COLS).eq('id', stay.data.agency_id).single();
    if (g.error) throw g.error;
    const agency = normAgency(g.data);
    const [owner] = await getPeople({ ids: [agency.owner_id] });
    return { kind: 'host', agency, owner, joined_at: stay.data.joined_at as string };
  }

  const [app, req] = await Promise.all([
    supabase.from('agency_applications').select('id, agency_name, status, reject_reason, created_at, agency_id').eq('applicant_id', me).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('agency_join_requests').select('id, agency_id, host_id, status, created_at').eq('host_id', me).eq('status', 'pending').maybeSingle(),
  ]);
  if (app.error) throw app.error;
  if (req.error) throw req.error;
  let request: (JoinRequest & { agency?: FoundAgency }) | null = (req.data as JoinRequest | null) ?? null;
  if (request) {
    const g = await supabase.from('agencies').select(AGENCY_COLS).eq('id', request.agency_id).maybeSingle();
    if (g.data) request = { ...request, agency: { ...normAgency(g.data), members: 0 } };
  }
  return { kind: 'none', application: (app.data as Application | null) ?? null, request };
}

function normAgency(row: Record<string, unknown>): Agency {
  return {
    id: row['id'] as string, code: Number(row['code']), name: row['name'] as string, owner_id: row['owner_id'] as string,
    commission_percent: row['commission_percent'] == null ? null : Number(row['commission_percent']),
    created_at: row['created_at'] as string,
  };
}

/** Turns typed text into an agency code (Arabic digits allowed), or null. */
export function parseAgencyCode(raw: string): number | null {
  const latin = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\s+/g, '');
  if (!/^\d{3,9}$/.test(latin)) return null;
  const n = Number(latin);
  return n >= 200 ? n : null;
}

export async function findAgency(code: number): Promise<FoundAgency | null> {
  const { data, error } = await supabase.rpc('find_agency', { p_code: code });
  if (error) throw error;
  const row = ((data ?? []) as FoundAgency[])[0];
  if (!row) return null;
  const [owner] = await getPeople({ ids: [row.owner_id] });
  return { ...row, code: Number(row.code), members: Number(row.members), owner };
}

export const applicationSchema = z.object({
  agency_name: z.string().trim().min(2, 'اسم الوكالة من حرفين على الأقل').max(40, 'اسم الوكالة طويل'),
  full_name: z.string().trim().min(2, 'اكتب اسمك الكامل').max(60, 'الاسم طويل'),
  phone: z.string().trim().transform((v) => v.replace(/[\s-]/g, '')).pipe(z.string().regex(/^\+?[0-9]{7,15}$/, 'رقم الواتساب مش صحيح')),
  country: z.string().trim().min(2, 'اكتب الدولة').max(40, 'اسم الدولة طويل'),
  note: z.string().trim().max(300, 'الملاحظات طويلة').optional().default(''),
});
export type ApplicationInput = z.input<typeof applicationSchema>;

export async function applyForAgency(input: ApplicationInput) {
  const v = applicationSchema.parse(input);
  const { error } = await supabase.rpc('apply_for_agency', {
    p_agency_name: v.agency_name, p_full_name: v.full_name, p_phone: v.phone, p_country: v.country, p_note: v.note || null,
  });
  if (error) throw error;
}

export async function requestJoin(agencyId: string) {
  const { error } = await supabase.rpc('request_join_agency', { p_agency: agencyId });
  if (error) throw error;
}
export async function cancelJoin(id: string) {
  const { error } = await supabase.rpc('cancel_join_request', { p_id: id });
  if (error) throw error;
}
export async function decideJoin(id: string, accept: boolean) {
  const { error } = await supabase.rpc('decide_join_request', { p_id: id, p_accept: accept });
  if (error) throw error;
}
export async function removeMember(hostId: string) {
  const { error } = await supabase.rpc('remove_agency_member', { p_host: hostId });
  if (error) throw error;
}

/** Join requests to the agent's agency from the last 7 days, newest first. */
export async function getJoinRequests(agencyId: string): Promise<(JoinRequest & { person?: RoomPerson | undefined })[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabase.from('agency_join_requests').select('id, agency_id, host_id, status, created_at')
    .eq('agency_id', agencyId).neq('status', 'cancelled').gte('created_at', since).order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as JoinRequest[];
  const people = await getPeople({ ids: [...new Set(rows.map((r) => r.host_id))] });
  return rows.map((r) => ({ ...r, person: people.find((p) => p.auth_id === r.host_id) }));
}

/** Active hosts, the agent first. */
export async function getMembers(agency: Agency): Promise<{ person: RoomPerson; joined_at: string; agent: boolean }[]> {
  const { data, error } = await supabase.from('agency_members').select('host_id, joined_at').eq('agency_id', agency.id).is('left_at', null).order('joined_at');
  if (error) throw error;
  const rows = (data ?? []) as { host_id: string; joined_at: string }[];
  const people = await getPeople({ ids: rows.map((r) => r.host_id) });
  return rows
    .map((r) => ({ person: people.find((p) => p.auth_id === r.host_id)!, joined_at: r.joined_at, agent: r.host_id === agency.owner_id }))
    .filter((m) => m.person)
    .sort((a, b) => Number(b.agent) - Number(a.agent));
}

export type AgencySummary = { this_week: number; last_week: number; members: number; pending_requests: number; commission_percent: number | null };
export async function getAgencySummary(): Promise<AgencySummary> {
  const { data, error } = await supabase.rpc('agency_summary');
  if (error) throw error;
  const r = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  return {
    this_week: Number(r['this_week'] ?? 0), last_week: Number(r['last_week'] ?? 0), members: Number(r['members'] ?? 0),
    pending_requests: Number(r['pending_requests'] ?? 0),
    commission_percent: r['commission_percent'] == null ? null : Number(r['commission_percent']),
  };
}

export async function getMembersIncome(from: string, to: string): Promise<{ person?: RoomPerson | undefined; host_id: string; diamonds: number; active: boolean }[]> {
  const { data, error } = await supabase.rpc('agency_members_income', { p_from: from, p_to: to });
  if (error) throw error;
  const rows = ((data ?? []) as { host_id: string; diamonds: number; active: boolean }[]).map((r) => ({ ...r, diamonds: Number(r.diamonds) }));
  const people = await getPeople({ ids: rows.map((r) => r.host_id) });
  return rows.map((r) => ({ ...r, person: people.find((p) => p.auth_id === r.host_id) }));
}

export async function getMyIncome(from: string, to: string): Promise<{ day: string; diamonds: number }[]> {
  const { data, error } = await supabase.rpc('my_agency_income', { p_from: from, p_to: to });
  if (error) throw error;
  return ((data ?? []) as { day: string; diamonds: number }[]).map((r) => ({ day: r.day, diamonds: Number(r.diamonds) }));
}

// ---------- Management ----------
export async function isAdmin(me: string): Promise<boolean> {
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', me).eq('role', 'admin').maybeSingle();
  return !error && !!data;
}
export type AdminApplication = {
  id: string; applicant_id: string; agency_name: string; full_name: string; phone: string; country: string; note: string | null;
  status: Application['status']; reject_reason: string | null; created_at: string; code: number | null; person?: RoomPerson | undefined;
};
export async function getApplicationsForReview(status: Application['status']): Promise<AdminApplication[]> {
  const { data, error } = await supabase.rpc('admin_agency_applications', { p_status: status });
  if (error) throw error;
  const rows = (data ?? []) as AdminApplication[];
  const people = await getPeople({ ids: [...new Set(rows.map((r) => r.applicant_id))] });
  return rows.map((r) => ({ ...r, person: people.find((p) => p.auth_id === r.applicant_id) }));
}
export async function reviewApplication(id: string, approve: boolean, reason?: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('review_agency_application', { p_id: id, p_approve: approve, p_reason: reason ?? null });
  if (error) throw error;
  return data == null ? null : Number(data);
}

// ---------- Numbers and dates ----------
/** The agency share of an income, or null while the share is not set yet. */
export function agencyCommission(diamonds: number, percent: number | null): number | null {
  if (percent == null) return null;
  return Math.round(diamonds * percent) / 100;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Monday–Sunday week containing `d`, moved by `offset` weeks, as YYYY-MM-DD strings. */
export function weekRange(d: Date, offset = 0): { from: string; to: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: isoDay(start), to: isoDay(end) };
}

/** First and last day of the month containing `d`, moved by `offset` months. */
export function monthRange(d: Date, offset = 0): { from: string; to: string; label: string } {
  const start = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return { from: isoDay(start), to: isoDay(end), label: `${start.getFullYear()}-${pad(start.getMonth() + 1)}` };
}

export const formatDiamonds = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 1 });

export const agencyErrorMessage = (e: unknown) => {
  const hint = (e as { hint?: string } | null)?.hint ?? '';
  return ({
    not_signed_in: 'لازم تسجل دخول الأول',
    bad_input: 'راجع البيانات اللي كتبتها',
    already_agent: 'إنت وكيل بالفعل',
    in_agency: 'العضو ده موجود في وكالة بالفعل',
    pending_exists: 'عندك طلب مستني الرد بالفعل',
    no_agency: 'الوكالة دي مش موجودة',
    not_owner: 'الوكيل بس هو اللي يقدر يعمل كده',
    not_pending: 'الطلب ده اتعامل معاه قبل كده',
    is_agent: 'الوكيل مايتشالش من وكالته',
    not_admin: 'الإدارة بس هي اللي تقدر تعمل كده',
    not_found: 'مش لاقيين الطلب ده',
    bad_range: 'الفترة دي مش مسموحة',
  } as Record<string, string>)[hint] ?? 'حصلت مشكلة، جرب تاني';
};
