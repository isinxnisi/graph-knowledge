import { z } from "zod";
import { entitySummarySchema } from "./api";
import type { Predicate } from "./predicates";
import { roleIdSchema } from "./contribution";

export const WORLD_IDS = ["manga", "film", "games", "music", "science", "technology", "history", "arts", "industry", "sports", "geography"] as const;
export const QUESTION_IDS = ["connections", "credits", "affiliations", "influences", "film-roles", "game-creators", "music-influences", "nobel", "research", "frontier", "period", "classification"] as const;
export type WorldId = typeof WORLD_IDS[number];
export type QuestionId = typeof QUESTION_IDS[number];
type Bilingual = readonly [string, string];
export const worldNames: Record<WorldId, Bilingual> = {
  manga: ["漫画・アニメ", "Manga & anime"], film: ["映画・ドラマ", "Film & television"],
  games: ["ゲーム", "Games"], music: ["音楽", "Music"], science: ["科学・発見", "Science & discovery"],
  technology: ["発明・技術", "Invention & technology"], history: ["歴史", "History"], arts: ["美術・文学", "Art & literature"],
  industry: ["企業・産業", "Business & industry"], sports: ["スポーツ", "Sports"], geography: ["地理・文化", "Places & culture"],
};
export const questionNames: Record<QuestionId, Bilingual> = {
  connections: ["この対象の接点を辿る", "Follow this entity's connections"],
  credits: ["作品のつくり手・別作品へ", "Creators and their other works"],
  affiliations: ["研究機関を介して人に出会う", "Meet people through institutions"],
  influences: ["影響の記録を一段ずつ辿る", "Follow influence records, one step at a time"],
  "film-roles": ["映画監督と出演者を探す", "Find directors and cast"],
  "game-creators": ["ゲーム開発者と代表作品", "Game developers and signature works"],
  "music-influences": ["音楽家の影響の系譜", "Influences among musicians"],
  nobel: ["ノーベル賞の受賞者を探す", "Find Nobel laureates"],
  research: ["理論・実験から人物へ", "From theories and experiments to people"],
  frontier: ["量子力学の最前線", "The frontier of quantum physics"],
  period: ["量子力学を年代から探す", "Explore quantum physics by period"],
  classification: ["この世界の人物・作品を探す", "Find people and works in this world"],
};
export const questionsForWorld: Record<WorldId, readonly QuestionId[]> = {
  manga: ["credits", "influences"], film: ["film-roles"], games: ["game-creators"], music: ["music-influences"],
  science: ["affiliations", "nobel", "research", "period", "frontier"], technology: ["research", "frontier"],
  history: ["period", "affiliations"], arts: ["classification", "influences"], industry: ["classification"],
  sports: ["classification"], geography: ["classification"],
};
export const unsupportedReasons: Partial<Record<QuestionId, Bilingual>> = {
  "film-roles": ["監督・出演の役割と映画分類は、現在の検索に対応していません。一般の制作関与では代用しません。", "Director/cast roles and film classification are not supported. General production credits cannot substitute for them."],
  "game-creators": ["ゲーム分類・開発担当・代表性を指定する検索は未対応です。", "Game classification, developer roles and signature-work selection are not supported."],
  "music-influences": ["人物間の影響記録は辿れますが、音楽家に限定する分類検索は未対応です。", "Person-to-person influence records can be followed; filtering for musicians is not supported."],
  nobel: ["受賞者・受賞年・部門の条件検索は未対応です。所属の根拠に受賞情報があっても、受賞者一覧とは扱いません。", "Laureate, award year and category filters are not supported. Award information in affiliation sources is not a laureate index."],
  research: ["理論・実験の分類と、成果から人物へ辿る関係は未対応です。", "Theory/experiment classification and relations from research outputs to people are not supported."],
  frontier: ["研究分野・現在の最前線を判定する検索は未対応です。登録日の新しさでは代用しません。", "Research-field and frontier filters are not supported. Recent additions do not establish cutting-edge research."],
  period: ["年代・研究分野で絞る検索は未対応です。個々の記録の期間は確認できます。", "Period and research-field filters are not supported. Individual records still show their periods."],
  classification: ["この世界に属する対象を分類して検索する機能は未対応です。", "Searching entities classified in this world is not supported."],
};
export const contextSchema = z.object({
  version: z.literal(1), world: z.enum(WORLD_IDS).nullable(), question: z.enum(QUESTION_IDS),
  anchor: entitySummarySchema.strip().nullable(), role: roleIdSchema.nullable(), q: z.string().max(100), names: z.boolean(),
});
export type DiscoveryContext = z.infer<typeof contextSchema>;
export const initialContext: DiscoveryContext = { version: 1, world: null, question: "connections", anchor: null, role: null, q: "", names: false };
export const questionPredicates: Partial<Record<QuestionId, Predicate>> = {
  credits: "CONTRIBUTED_TO", affiliations: "AFFILIATED_WITH", influences: "INFLUENCED_BY",
};
export type DiscoveryPlan =
  | { state: "unsupported"; reason: Bilingual }
  | { state: "needs-anchor" | "needs-name" }
  | { state: "ready"; operation: "claims"; criteria: import("./discovery-records").RecordSearchCriteria }
  | { state: "ready"; operation: "names"; q: string }
  | { state: "ready"; operation: "neighbors"; anchorId: string; predicate: Predicate | null; role: DiscoveryContext["role"] };

// Worlds describe interest, never an implicit database classification or name query.
export function resolveDiscovery(context: DiscoveryContext): DiscoveryPlan {
  const reason = unsupportedReasons[context.question];
  if (reason) return { state: "unsupported", reason };
  if (context.role && context.question !== "credits") return { state: "unsupported", reason: ["制作役割の条件が残っています。役割を外すか、作品の問いへ戻してください。", "A production role is still selected. Remove it or return to the creators question."] };
  if (context.names) return context.q.trim() ? { state: "ready", operation: "names", q: context.q.trim() } : { state: "needs-name" };
  if (!context.anchor) return { state: "needs-anchor" };
  return { state: "ready", operation: "neighbors", anchorId: context.anchor.id, predicate: questionPredicates[context.question] ?? null, role: context.role };
}
export const prototypeSeeds = [
  { id: "2b7c6289-d050-4dc0-93e3-9307681253cc", question: "credits", world: "manga", title: ["PLUTOの制作記録へ", "Production records around PLUTO"] },
  { id: "0820c3e8-7219-4e57-abb0-7d04e253fd4a", question: "affiliations", world: "science", title: ["Princetonの所属記録へ", "Affiliations around Princeton"] },
  { id: "8e322435-4318-4ad0-835b-3f71d2537421", question: "affiliations", world: "science", title: ["量子力学の歴史の足場へ", "A starting point for quantum history"] },
] as const;
export function readPrototypeContext(value: unknown): DiscoveryContext {
  const parsed = contextSchema.safeParse(value);
  return parsed.success ? parsed.data : initialContext;
}
