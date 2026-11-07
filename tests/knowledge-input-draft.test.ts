import { expect, it } from "vitest";
import { correctionKnowledgeInputDraft, knowledgeInputCommand, knowledgeInputDraftSchema } from "../lib/client/knowledge-input-draft";
import { knowledgeRecordContentSchema } from "../lib/domain/knowledge-foundation";
import { declaredTextLanguage } from "../lib/domain/knowledge-language";

const ja = declaredTextLanguage("ja"), en = declaredTextLanguage("en");
it("preserves incomplete clock/cycle fields as a resumable draft, not as a submitted valid record",()=>{const input=draft();input.times=[{id:"clock",time:{kind:"calendar",from:"2021-12-25T",label:"",expression:"午後頃"}}];const restored=knowledgeInputDraftSchema.parse(JSON.parse(JSON.stringify(input)));expect(restored.times).toEqual(input.times);const command=knowledgeInputCommand(restored) as {content:unknown};expect(knowledgeRecordContentSchema.safeParse(command.content).success).toBe(false);});
function draft() {
  return correctionKnowledgeInputDraft({ id: "record", revision: 3, createdAt: "2026-11-05", reason: "原文", content: knowledgeRecordContentSchema.parse({
    kind: "relation", subjectId: "a", objectId: "b", assertion: "AはBを描いた。", relation: "描いた", scope: "初版", textLanguages: { assertion: ja, relation: ja, scope: ja },
    evidence: [{ id: "quote", source: { id: "source", revision: 1 }, excerpt: "A drew B.", locator: "Credits", textLanguages: { excerpt: en, locator: en } }],
  }) });
}

it.each(["assertion", "relation"] as const)("operator correction clears only the edited %s language, including after draft restoration", field => {
  const input = draft(); input.values[field] = field === "assertion" ? "A drew B." : "drew";
  const restored = knowledgeInputDraftSchema.parse(JSON.parse(JSON.stringify(input)));
  const command = knowledgeInputCommand(restored) as { content: ReturnType<typeof knowledgeRecordContentSchema.parse> };
  expect(command.content[field]).toBe(input.values[field]);
  expect(command.content.textLanguages?.[field]).toBeUndefined();
  expect(command.content.textLanguages?.[field === "assertion" ? "relation" : "assertion"]).toEqual(ja);
  expect(command.content.textLanguages?.scope).toEqual(ja);
  expect(command.content.evidence).toEqual(input.mode === "correct" ? input.base.content.evidence : []);
  expect(input.mode === "correct" && input.base.content.textLanguages?.[field]).toEqual(ja);
});

it("keeps declarations for unchanged or restored original prose", () => {
  const input = draft(); input.values.assertion = "Changed"; input.values.assertion = "AはBを描いた。";
  const command = knowledgeInputCommand(input) as { content: ReturnType<typeof knowledgeRecordContentSchema.parse> };
  expect(command.content.textLanguages).toEqual({ assertion: ja, relation: ja, scope: ja });
});
