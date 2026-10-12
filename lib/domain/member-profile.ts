import { z } from "zod";

// 表示名だけを変更する。所有者ID・権限・認証情報は入力として受け取らない。
export const memberProfileUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
});
