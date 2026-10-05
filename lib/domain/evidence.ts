import { z } from "zod";
export const languageSchema = z.string().min(1).refine(value => { try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; } }, "Invalid language tag");
// 原表記の保存形だけ共有する。表記の解釈・語彙は各domainが決める。
export const originalTermEvidenceSchema = z.strictObject({ originalText: z.string().trim().min(1), language: languageSchema });
