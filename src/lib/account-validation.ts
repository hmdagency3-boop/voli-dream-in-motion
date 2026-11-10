import { z } from 'zod';
export const accountSchema = z.object({
  displayName: z.string().trim().min(1, 'اكتب اسم المستخدم').max(60, 'الاسم طويل جداً'),
  email: z.string().trim().email('اكتب بريداً إلكترونياً صحيحاً'),
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
});
export const loginSchema = accountSchema.omit({ displayName: true });
