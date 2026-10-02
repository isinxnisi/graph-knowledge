export const ENTITY_KINDS = ["person", "work", "organization", "event"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const PREDICATE_KEYS = [
  "ASSISTANT_OF", "INFLUENCED_BY", "CONTRIBUTED_TO", "AFFILIATED_WITH",
] as const;
export type Predicate = (typeof PREDICATE_KEYS)[number];

export const PREDICATES = {
  ASSISTANT_OF: {
    subjectKind: "person", objectKind: "person",
    label: "アシスタントだった", reverseLabel: "アシスタントに迎えていた",
    description: "対象人物の制作補助を行ったという主張",
  },
  INFLUENCED_BY: {
    subjectKind: "person", objectKind: "person",
    label: "影響を受けた", reverseLabel: "影響を与えた",
    description: "主体が対象から影響を受けたという主張",
  },
  CONTRIBUTED_TO: {
    subjectKind: "person", objectKind: "work",
    label: "制作に関わった", reverseLabel: "制作関係者",
    description: "作品への関与。作者・編集者等の役割は初期は区別しない",
  },
  AFFILIATED_WITH: {
    subjectKind: "person", objectKind: "organization",
    label: "関わりがあった", reverseLabel: "関係者",
    description: "組織との関わり。雇用や所属を断定しない",
  },
} as const satisfies Record<Predicate, {
  subjectKind: EntityKind; objectKind: EntityKind;
  label: string; reverseLabel: string; description: string;
}>;
