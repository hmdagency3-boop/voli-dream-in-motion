import { useEffect, useRef, useState } from 'react';
import { Ban, Check, ClipboardList, DoorOpen, Heart, House, Image, Lock, Megaphone, MessageCircle, Mic, MicOff, Settings, Share2, ShieldCheck, ShoppingBag, Stethoscope, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { manageRoom, type RoomToolsState } from '@/lib/room-tools';
import { ROOM_THEMES, SEAT_COUNTS, uploadRoomCover, type Room, type RoomPerson } from '@/lib/rooms';
import { toast } from 'sonner';

type Props = { room: Room; me: string; people: Record<string, RoomPerson>; members: string[]; state: RoomToolsState; owner: boolean; manager: boolean; open: boolean; onOpenChange: (open: boolean) => void; onRefresh: () => Promise<void>; onShare: () => void; onGifts: () => void; onPick: (p: RoomPerson) => void; voiceConnected: boolean; needsTap: boolean; startAudio: () => void };
export function RoomTools(p: Props) {
 const [panel,setPanel]=useState<string|null>(null);
 const [draft,setDraft]=useState(''); const [busy,setBusy]=useState(false);
 const file=useRef<HTMLInputElement>(null);
 useEffect(()=>{ if(!p.open) setPanel(null); },[p.open]);
 async function act(action:string,data:Record<string,unknown>={}) {
  if(busy)return; setBusy(true);
  try { await manageRoom(p.room.id,action,data); await p.onRefresh(); toast.success('تم'); }
  catch { toast.error('التغيير ماتحفظش؛ اتأكد من صلاحياتك وتشغيل تحديث أدوات الروم'); }
  finally { setBusy(false); }
 }
 const tools=[
  {key:'mode',label:'وضع الغرفة',icon:House,owner:true},
  {key:'theme',label:'خلفية الغرفة',icon:Image,owner:true},
  {key:'edit',label:'تعديل الغرفة',icon:Settings,owner:true},
  {key:'admins',label:'أدمن',icon:ShieldCheck,owner:true},
  {key:'chat',label:`منطقة الدردشة (${p.state.chat_enabled?'On':'Off'})`,icon:MessageCircle,manager:true},
  {key:'share',label:'مشاركة',icon:Share2},
  {key:'settings',label:'إعدادات الغرفة',icon:ClipboardList,manager:true},
  {key:'private',label:'دردشة خاصة',icon:Users},
  {key:'charisma',label:p.state.show_charisma?'إخفاء الكاريزما':'إظهار الكاريزما',icon:Heart,manager:true},
  {key:'diagnostics',label:'اكتشاف الأخطاء',icon:Stethoscope},
  {key:'lock',label:p.room.locked?'إلغاء القفل':'قفل الغرفة',icon:Lock,owner:true},
  {key:'announcement',label:'إعلان',icon:Megaphone,manager:true},
  {key:'blacklist',label:'القائمة السوداء',icon:Ban,manager:true},
  {key:'store',label:'متجر الهدايا',icon:ShoppingBag},
  {key:'impressions',label:'الانطباعات',icon:ClipboardList},
 ];
 function choose(key:string) {
  if(key==='share'){p.onShare();return;}
  if(key==='store'){p.onOpenChange(false);p.onGifts();return;}
  if(key==='chat'){void act('chat',{enabled:!p.state.chat_enabled});return;}
  if(key==='charisma'){void act('charisma',{enabled:!p.state.show_charisma});return;}
  setDraft(key==='announcement'?p.room.announcement:key==='edit'?p.room.name:''); setPanel(key);
 }
 const title=tools.find(t=>t.key===panel)?.label??'أدوات الروم';
 const field='w-full rounded-lg border border-input bg-secondary p-3 text-sm outline-none focus:ring-2 focus:ring-ring';
 const list=panel==='blacklist'?p.state.blacklist:panel==='admins'?p.members.filter(id=>id!==p.room.owner_id):p.members.filter(id=>id!==p.me);
 return <Sheet open={p.open} onOpenChange={p.onOpenChange}><SheetContent side="bottom" className="mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-t-lg px-4 pb-6" dir="rtl">
  <SheetTitle className="mb-5 flex items-center gap-2 px-10">{panel&&<Button size="icon" variant="ghost" aria-label="رجوع للأدوات" onClick={()=>setPanel(null)}><DoorOpen/></Button>}{title}</SheetTitle>
  {!panel?<div className="grid grid-cols-4 gap-x-2 gap-y-5">{tools.filter(t=>(!t.owner||p.owner)&&(!t.manager||p.manager)).map(t=><Button key={t.key} variant="ghost" disabled={busy} onClick={()=>choose(t.key)} className="h-auto min-h-24 min-w-0 flex-col gap-2 whitespace-normal px-1 py-1 text-center text-xs leading-5"><span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-primary"><t.icon className="size-5"/></span>{t.label}</Button>)}</div>:
  <div className="space-y-3">
   {panel==='mode'&&<div className="grid grid-cols-4 gap-2">{SEAT_COUNTS.map(n=><Button key={n} variant={p.room.seat_count===n?'default':'secondary'} disabled={busy} onClick={()=>act('settings',{seat_count:n})}>{n} مايك</Button>)}</div>}
   {panel==='theme'&&<div className="grid grid-cols-2 gap-2">{ROOM_THEMES.map(t=><Button key={t.key} variant={p.room.theme===t.key?'default':'secondary'} disabled={busy} onClick={()=>act('settings',{theme:t.key})}>{t.label}</Button>)}</div>}
   {panel==='edit'&&<><input aria-label="اسم الروم" maxLength={40} className={field} value={draft} onChange={e=>setDraft(e.target.value)}/><Button disabled={busy||!draft.trim()} onClick={()=>act('settings',{name:draft.trim()})}><Check/>حفظ الاسم</Button><Button variant="secondary" disabled={busy} onClick={()=>file.current?.click()}><Image/>تغيير صورة الروم</Button><input ref={file} hidden type="file" accept="image/*" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith('image/')||f.size>5*1024*1024){toast.error('اختار صورة أقل من 5 ميجا');return;}setBusy(true);try{const url=await uploadRoomCover(p.me,f);setBusy(false);await act('settings',{cover_url:url});}catch{toast.error('الصورة ماترفعتش');setBusy(false);}e.target.value='';}}/></>}
   {panel==='settings'&&<><Button className="w-full" variant="secondary" disabled={busy} onClick={()=>act('chat',{enabled:!p.state.chat_enabled})}><MessageCircle/>{p.state.chat_enabled?'قفل الدردشة':'فتح الدردشة'}</Button><Button className="w-full" variant="secondary" disabled={busy} onClick={()=>act('charisma',{enabled:!p.state.show_charisma})}><Heart/>{p.state.show_charisma?'إخفاء الكاريزما':'إظهار الكاريزما'}</Button></>}
   {panel==='lock'&&<><input aria-label="كلمة سر الروم" inputMode="numeric" maxLength={8} value={draft} onChange={e=>setDraft(e.target.value.replace(/\D/g,''))} className={field} placeholder="كلمة السر"/><Button disabled={busy||!/^\d{4,8}$/.test(draft)} onClick={()=>act('settings',{password:draft})}><Lock/>حفظ القفل</Button>{p.room.locked&&<Button variant="secondary" disabled={busy} onClick={()=>act('settings',{password:''})}>إلغاء القفل</Button>}</>}
   {panel==='announcement'&&<><textarea aria-label="إعلان الروم" maxLength={300} rows={4} value={draft} onChange={e=>setDraft(e.target.value)} className={field}/><Button disabled={busy} onClick={()=>act('announcement',{body:draft})}><Check/>حفظ الإعلان</Button></>}
   {['admins','private','blacklist'].includes(panel)&&<>{list.length===0&&<p className="py-6 text-center text-sm text-muted-foreground">لا يوجد أعضاء</p>}{list.map(id=>{const person=p.people[id];return <div key={id} className="flex min-w-0 items-center justify-between gap-2 border-b border-border py-3"><span className="min-w-0 truncate text-sm">{person?.display_name??'عضو'}</span>{panel==='admins'?<Button size="sm" variant={p.state.admins.includes(id)?'secondary':'default'} disabled={busy} onClick={()=>act('admin',{target:id,enabled:!p.state.admins.includes(id)})}>{p.state.admins.includes(id)?'سحب الأدمن':'تعيين أدمن'}</Button>:panel==='blacklist'?<Button size="sm" disabled={busy} onClick={()=>act('unblacklist',{target:id})}>إلغاء الحظر</Button>:person&&<Button size="sm" onClick={()=>{p.onOpenChange(false);p.onPick(person);}}>دردشة خاصة</Button>}</div>})}</>}
   {panel==='diagnostics'&&<><p className="flex items-center justify-between text-sm">اتصال الصوت<span className={p.voiceConnected?'text-primary':'text-destructive'}>{p.voiceConnected?'متصل':'غير متصل'}</span></p><p className="text-sm">المتواجدين: {p.members.length}</p><p className="text-sm">تحديث أدوات الروم: متاح</p>{p.needsTap&&<Button onClick={p.startAudio}><Mic/>تشغيل الصوت</Button>}<Button variant="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await p.onRefresh();toast.success('تم تحديث حالة الروم');}catch{toast.error('التحديث ماوصلش');}finally{setBusy(false);}}}><Stethoscope/>فحص الاتصال</Button></>}
   {panel==='impressions'&&<><textarea aria-label="انطباعك عن الروم" rows={3} maxLength={300} className={field} value={draft} onChange={e=>setDraft(e.target.value)}/><Button disabled={busy||!draft.trim()} onClick={()=>act('impression',{body:draft.trim()})}>حفظ انطباعك</Button>{p.state.impressions.map(i=><div key={i.auth_id} className="border-b border-border py-3"><p className="text-xs text-muted-foreground">{p.people[i.auth_id]?.display_name??'عضو'}</p><p className="whitespace-pre-wrap break-words text-sm">{i.body}</p></div>)}</>}
  </div>}
 </SheetContent></Sheet>;
}
export function SeatMenu({seat,control,occupied,mine,busy,onClose,onMove,onInvite,onAction,onProfile}:{seat:number|null;control:{locked:boolean;muted:boolean};occupied:boolean;mine:boolean;busy:boolean;onClose:()=>void;onMove:()=>void;onInvite:()=>void;onAction:(action:string,enabled?:boolean)=>void;onProfile:()=>void}) {
 return <Sheet open={seat!==null} onOpenChange={o=>!o&&onClose()}><SheetContent side="bottom" className="mx-auto max-w-md rounded-t-lg p-4" dir="rtl"><SheetTitle className="mb-3 px-10">مايك {seat}</SheetTitle><div className="grid divide-y divide-border">
 <Button variant="ghost" className="h-14 justify-start" disabled={busy||(!mine&&(occupied||control.locked))} onClick={onMove}>{mine?<DoorOpen/>:<Mic/>}{mine?'النزول من المايك':'انتقل إلى هذا المقعد'}</Button>
 {!occupied&&<Button variant="ghost" className="h-14 justify-start" disabled={busy||control.locked} onClick={onInvite}><UserPlus/>دعوة إلى المايك</Button>}
 <Button variant="ghost" className="h-14 justify-start" disabled={busy} onClick={()=>onAction('seat_mute',!control.muted)}>{control.muted?<Mic/>:<MicOff/>}{control.muted?'فتح المايك':'قفل المايك'}</Button>
 <Button variant="ghost" className="h-14 justify-start" disabled={busy} onClick={()=>onAction('seat_lock',!control.locked)}><Lock/>{control.locked?'فتح هذا المقعد':'قفل هذا المقعد'}</Button>
 {occupied&&!mine&&<><Button variant="ghost" className="h-14 justify-start" onClick={onProfile}><Users/>ملف العضو</Button><Button variant="ghost" className="h-14 justify-start text-destructive" disabled={busy} onClick={()=>onAction('remove_seat')}><X/>إنزال من المايك</Button></>}
 <Button variant="secondary" className="mt-3 h-11" onClick={onClose}>إلغاء</Button>
 </div></SheetContent></Sheet>;
}
