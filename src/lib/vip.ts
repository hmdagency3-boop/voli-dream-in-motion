/**
 * VIP dragon tiers (1–8). Mirrors public.vip_tiers in supabase/003_vip.sql, which is the source of truth
 * for rules; this file holds what the app shows. Prices and durations come from the database.
 */
export type VipLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ChatBubble = 'custom' | 'neon' | null;
export type IdCard = 'special' | 'gold' | 'diamond' | 'legendary' | null;

export type VipTier = {
  level: VipLevel;
  key: string;
  nameAr: string;
  nameEn: string;
  /** Features this tier adds, in the user's words. */
  features: string[];
  chatBubble: ChatBubble;
  idCard: IdCard;
  /** Entrance picture key, same as vip_tiers.entrance (a tier keeps the lower tier's bar until it has its own). */
  entrance: string;
  hideLocation: boolean;
  invisibleMode: boolean;
  /** Static class names per tier (Tailwind must see them literally). */
  text: string;
  bg: string;
  ring: string;
  border: string;
  /** CSS colour value for glows. */
  color: string;
};

export const VIP_TIERS: VipTier[] = [
  {
    level: 1, key: 'bronze', nameAr: 'تنين البرونز', nameEn: 'Bronze Hatchling Dragon',
    features: ['إطار بروفايل التنين البرونزي', 'شارة الشات (Dragon V1 Badge)', 'شريط دخولية التنين البرونزي في غرف البث', 'تمييز لون اسم المستخدم في غرف البث'],
    chatBubble: null, idCard: null, entrance: 'bronze_dragon_bar', hideLocation: false, invisibleMode: false,
    text: 'text-vip-1', bg: 'bg-vip-1', ring: 'ring-vip-1', border: 'border-vip-1', color: 'var(--vip-1)',
  },
  {
    level: 2, key: 'silver', nameAr: 'تنين الفضة', nameEn: 'Silver Wyvern Dragon',
    features: ['إطار البروفايل الفضي', 'فقاعة كلام (Chat Bubble) مخصصة في الشات', 'إخفاء الموقع الجغرافي والبلد'],
    chatBubble: 'custom', idCard: null, entrance: 'silver_dragon_bar', hideLocation: true, invisibleMode: false,
    text: 'text-vip-2', bg: 'bg-vip-2', ring: 'ring-vip-2', border: 'border-vip-2', color: 'var(--vip-2)',
  },
  {
    level: 3, key: 'gold', nameAr: 'تنين الذهب', nameEn: 'Golden Flame Dragon',
    features: ['إطار التنين الذهبي المتوهج', 'دخولية البث (تنين ذهبي صغير يدخل الروم)', 'كارت الآيدي المميز', 'زيادات في سعة قائمة الأصدقاء'],
    chatBubble: 'custom', idCard: 'special', entrance: 'gold_dragon', hideLocation: true, invisibleMode: false,
    text: 'text-vip-3', bg: 'bg-vip-3', ring: 'ring-vip-3', border: 'border-vip-3', color: 'var(--vip-3)',
  },
  {
    level: 4, key: 'cosmic', nameAr: 'تنين الأرجوان الكوني', nameEn: 'Cosmic Void Dragon',
    features: ['إطار التنين الكوني الأرجواني', 'فقاعة كلام نيون متوهجة', 'دخولية طيران تنين أرجواني', 'حصانة الكتم والطرد ضد المشرفين العاديين'],
    chatBubble: 'neon', idCard: 'special', entrance: 'purple_flying_dragon', hideLocation: true, invisibleMode: false,
    text: 'text-vip-4', bg: 'bg-vip-4', ring: 'ring-vip-4', border: 'border-vip-4', color: 'var(--vip-4)',
  },
  {
    level: 5, key: 'ruby', nameAr: 'تنين الياقوت الأحمر', nameEn: 'Crimson Ruby Dragon',
    features: ['إطار تنين الياقوت الأحمر المضيء', 'دخولية تنين أحمر ناري', 'كارت آيدي ذهبي', 'وضع التخفي (Invisible Mode) في غرف البث وقوائم المتواجدين'],
    chatBubble: 'neon', idCard: 'gold', entrance: 'red_fire_dragon', hideLocation: true, invisibleMode: true,
    text: 'text-vip-5', bg: 'bg-vip-5', ring: 'ring-vip-5', border: 'border-vip-5', color: 'var(--vip-5)',
  },
  {
    level: 6, key: 'emerald', nameAr: 'تنين الزمرد الأخضر', nameEn: 'Emerald Serpent Dragon',
    features: ['إطار التنين الزمردي الكريستالي', 'دخولية تنين زمردي ضخم', 'صلاحية الإدارة الفائقة: طرد وكتم المشرفين والـ VIP الأقل رتبة', 'راتب عملات كوينز شهري مجاني'],
    chatBubble: 'neon', idCard: 'gold', entrance: 'emerald_giant_dragon', hideLocation: true, invisibleMode: true,
    text: 'text-vip-6', bg: 'bg-vip-6', ring: 'ring-vip-6', border: 'border-vip-6', color: 'var(--vip-6)',
  },
  {
    level: 7, key: 'diamond', nameAr: 'تنين الماس الملكي', nameEn: 'Royal Diamond Dragon',
    features: ['إطار التنين الماسي المتحرك الناصع', 'دخولية تنين ماسي طائر تشعل الروم', 'كارت آيدي ماسي مخصص', 'تنبيه إشعار الروم: يظهر شريط نيون في الروم فور دخوله', 'خدمة عملاء وحسابات خاصة ومباشرة'],
    chatBubble: 'neon', idCard: 'diamond', entrance: 'diamond_flying_dragon', hideLocation: true, invisibleMode: true,
    text: 'text-vip-7', bg: 'bg-vip-7', ring: 'ring-vip-7', border: 'border-vip-7', color: 'var(--vip-7)',
  },
  {
    level: 8, key: 'emperor', nameAr: 'التنين الأسطوري الكوني', nameEn: 'Supreme Emperor Dragon - Ultimate King',
    features: ['إطار التاج الإمبراطوري والتنين الأسطوري الأعلى في التطبيق', 'دخولية التنين الأسطوري الأعظم بتأثيرات شاشة كاملة وصوت زئير أسطوري', 'آيدي أسطوري فاخر مكون من 4 أرقام', 'إذاعة عامة للتطبيق بالكامل (System Broadcast) تنبه كل الغرف بدخوله', 'الحصانة المطلقة: عدم القابلية للطرد أو الكتم نهائياً من أي شخص في التطبيق ما عدا الإدارة العليا'],
    chatBubble: 'neon', idCard: 'legendary', entrance: 'legendary_dragon', hideLocation: true, invisibleMode: true,
    text: 'text-vip-8', bg: 'bg-vip-8', ring: 'ring-vip-8', border: 'border-vip-8', color: 'var(--vip-8)',
  },
];

export function vipTier(level: number | null | undefined): VipTier | null {
  return VIP_TIERS.find((t) => t.level === level) ?? null;
}

/** The tier a member has right now: 0 when they have none or it has ended. */
export function activeVipLevel(p: { vip_level?: number | null; vip_expires_at?: string | null } | null | undefined, now = Date.now()): number {
  const level = Number(p?.vip_level ?? 0);
  if (!Number.isInteger(level) || level < 1 || level > 8) return 0;
  if (p?.vip_expires_at && new Date(p.vip_expires_at).getTime() <= now) return 0;
  return level;
}

/** Lowest tier that includes a feature. */
export const VIP_FEATURE_FROM = { hideLocation: 2, specialIdCard: 3, invisibleMode: 5 } as const;
