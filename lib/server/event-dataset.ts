import { readFile } from "node:fs/promises";
import { z } from "zod";
import { entitySchema, sourceSchema, validateFixture } from "../domain/fixture";
import { eventMetadataSchema, eventParticipationSchema, eventParticipationEvidenceSchema } from "../domain/event-participation";
import { periodSchema } from "../domain/dates";
import { jsonFile, sha256 } from "./pilot-dataset";
import { loadScienceV2 } from "./science-v2-dataset";

export const EVENT_DIRECTORY = "datasets/pilot-event/v1";
const text = z.string().min(1), hash = z.string().regex(/^[a-f0-9]{64}$/);
export const eventLedgerSchema = z.strictObject({
  schemaVersion: z.literal(1), dataset: z.strictObject({ id: z.literal("pilot-event-v1"), version: z.literal(1), transformVersion: z.literal(1), createdAt: z.iso.datetime(), scope: text }),
  base: z.strictObject({ dataset: z.literal("pilot-science-v2"), files: z.record(text, hash) }),
  research: z.strictObject({ file: z.literal("docs/research/phase-13-relation-model/v2/ledger.json"), sha256: hash }),
  sources: z.array(z.strictObject({ ref: z.enum(["S11", "S12"]), id: z.uuidv4(), title: text, publisher: text, authors: z.array(text), language: text, publishedAt: sourceSchema.shape.publishedAt, editionAndSourceLimit: text, retrieval: z.unknown() })).length(2),
  entities: z.array(entitySchema.extend({ event: eventMetadataSchema.nullable() })).length(2),
  candidates: z.array(z.strictObject({ ref: z.enum(["E01", "E03"]), claimId: z.uuidv4(), subjectId: z.uuidv4(), objectId: z.uuidv4(), predicate: z.literal("PARTICIPATED_IN"), polarity: z.literal("affirmed"), period: periodSchema, eventParticipation: eventParticipationSchema.nullable(), sourceMeaning: text, originalRelationTerms: z.array(z.strictObject({ text, language: text })).min(1), scope: text, doNotInfer: z.array(text), citations: z.array(z.strictObject({ id: z.uuidv4(), sourceRef: z.enum(["S11", "S12"]), locator: text, language: text, sourceMeaning: text, originalPeriodText: text.nullable(), eventParticipationEvidence: eventParticipationEvidenceSchema.nullable() })).min(1) })).length(3),
  humanAcceptance: z.strictObject({ decision: z.enum(["pending", "accepted"]), reviewer: text.nullable(), decidedAt: z.iso.date().nullable(), reference: text.nullable(), scope: text }).superRefine((a, ctx) => {
    if (a.decision === "accepted" && (!a.reviewer || !a.decidedAt || !a.reference)) ctx.addIssue({ code: "custom", message: "Human acceptance requires reviewer, date and user reference" });
  }), identity: z.record(text, text), excluded: z.strictObject({ ref: z.literal("E02"), status: z.literal("pending-not-for-runtime"), reason: text, doNotInfer: z.array(text) }), recheck: z.unknown(),
});
export async function readEventLedger(directory = EVENT_DIRECTORY) {
  const bytes = await readFile(`${directory}/ledger.json`);
  const ledger = eventLedgerSchema.parse(JSON.parse(bytes.toString()));
  for (const required of ["fixtures/demo.json", "datasets/pilot-urasawa/v1/data.json", "datasets/pilot-urasawa/v2/data.json", "datasets/pilot-science/v1/data.json", "datasets/pilot-science/v2/data.json"]) if (!ledger.base.files[required]) throw new Error("Missing frozen dataset baseline");
  for (const [file, expected] of Object.entries(ledger.base.files)) {
    if (!/^(fixtures\/demo\.json|datasets\/(pilot-urasawa|pilot-science)\/v[12]\/(raw\/)?[^/]+\.json)$/.test(file)) throw new Error("Invalid frozen input path");
    if (sha256(await readFile(file)) !== expected) throw new Error(`Frozen input changed: ${file}`);
  }
  const researchBytes = await readFile(ledger.research.file);
  if (sha256(researchBytes) !== ledger.research.sha256) throw new Error("Research provenance changed");
  const research = JSON.parse(researchBytes.toString());
  for (const source of ledger.sources) {
    const original = research.sources.find((s: { id: string }) => s.id === source.ref);
    if (!original || ["title", "publisher", "authors", "language", "publishedAt", "editionAndSourceLimit", "retrieval"].some(key => JSON.stringify(source[key as keyof typeof source]) !== JSON.stringify(original[key]))) throw new Error("Event source provenance mismatch");
  }
  const event = ledger.entities.find(e => e.kind === "event"), person = ledger.entities.find(e => e.kind === "person");
  if (!event?.event || !person || person.event !== null || JSON.stringify(event.event.period) !== JSON.stringify(research.candidates.find((c: { id: string }) => c.id === "E01").eventPeriod)) throw new Error("Specific Event occurrence/period differs from reviewed evidence");
  const broad = ledger.candidates.filter(c => c.eventParticipation === null), chair = ledger.candidates.filter(c => c.eventParticipation !== null);
  if (broad.length !== 2 || chair.length !== 1 || chair[0].ref !== "E01" || new Set(broad.map(c => c.ref)).size !== 2) throw new Error("Only E01 broad/chair and E03 broad projections are allowed");
  for (const candidate of ledger.candidates) {
    const original = research.candidates.find((c: { id: string }) => c.id === candidate.ref);
    if (candidate.objectId !== event.id || candidate.subjectId !== (candidate.ref === "E01" ? person.id : "5cda395a-4927-4cae-92fe-839b29d05095") || candidate.period.from !== null || candidate.period.to !== null || candidate.scope !== original.scope || candidate.sourceMeaning !== original.proposedNarrowMeaning || JSON.stringify(candidate.originalRelationTerms) !== JSON.stringify(original.originalRelationTerms) || JSON.stringify(candidate.doNotInfer) !== JSON.stringify(original.doNotInfer)) throw new Error("Participation projection differs from reviewed narrow evidence");
    const expectedRefs = candidate.eventParticipation ? ["S11", "S12"] : ["S12"];
    if (candidate.citations.length !== expectedRefs.length || !expectedRefs.every(ref => candidate.citations.some(c => c.sourceRef === ref))) throw new Error("Participant list is required; invitation/photo/planned list is not participation evidence");
    for (const citation of candidate.citations) {
      const old = original.citations.find((c: { sourceId: string }) => c.sourceId === citation.sourceRef);
      const evidence = candidate.eventParticipation ? { originalText: citation.sourceRef === "S11" ? "Chair" : "Président", language: citation.language } : null;
      if (!old || citation.locator !== old.locator || citation.sourceMeaning !== old.sourceMeaning || citation.language !== old.language || citation.originalPeriodText !== old.originalPeriodText || JSON.stringify(citation.eventParticipationEvidence) !== JSON.stringify(evidence)) throw new Error("Original role/locator/language differs from reviewed evidence");
    }
  }
  return { ledger, bytes };
}
export async function prepareEventPilot(directory = EVENT_DIRECTORY) {
  const { ledger, bytes } = await readEventLedger(directory);
  // 全検証より先にDBを開かない。Codexによる資料確認を人間受入に置換しない。
  if (ledger.humanAcceptance.decision !== "accepted") throw new Error("Event E01/E03 and occurrence identity/period require explicit human acceptance; generation/seed blocked");
  const base = await loadScienceV2();
  const fixture = validateFixture({ schemaVersion: 4,
    entities: [...base.entities.map(e => ({ ...e, event: null })), ...ledger.entities],
    claims: [...base.claims.map(c => ({ ...c, eventParticipation: null })), ...ledger.candidates.map(c => ({ id: c.claimId, subjectId: c.subjectId, objectId: c.objectId, predicate: c.predicate, polarity: c.polarity, period: c.period, contribution: null, organizationParticipation: null, eventParticipation: c.eventParticipation, visibility: "published", createdAt: ledger.dataset.createdAt, updatedAt: ledger.dataset.createdAt }))],
    sources: [...base.sources, ...ledger.sources.map(s => ({ id: s.id, kind: s.ref === "S12" ? "book" : "web", title: s.title, authors: s.authors, publisher: s.publisher, url: (s.retrieval as { url: string }).url, publishedAt: s.publishedAt, edition: null, note: s.editionAndSourceLimit, isDemo: false }))],
    citations: [...base.citations.map(c => ({ ...c, eventParticipationEvidence: null })), ...ledger.candidates.flatMap(c => c.citations.map(citation => {
      const source = ledger.sources.find(s => s.ref === citation.sourceRef)!;
      return { id: citation.id, claimId: c.claimId, sourceId: source.id, locator: citation.locator, stance: "support", accessedAt: (source.retrieval as { accessedAtUtc: string }).accessedAtUtc.slice(0,10), roleEvidence: null, positionEvidence: null, eventParticipationEvidence: citation.eventParticipationEvidence,
        note: `${citation.sourceMeaning} ${c.scope} 開催期間原表記：${citation.originalPeriodText ?? "索引は開催年のみ"}。Eventの期間であり人物の全日程出席を保証しない。${c.eventParticipation ? "会議議長としての参加。" : "このClaimでは参加上の立場を限定しない。"}${c.ref === "E01" ? " Lorentzの広い参加と議長参加は同じ資料事実の別粒度であり独立した根拠数を意味しない。" : ""}` };
    }))],
  });
  const data = jsonFile(fixture);
  return { fixture, data, manifest: { ...ledger.dataset, frozen: true, files: { "ledger.json": sha256(bytes), "data.json": sha256(data) }, frozenInputs: ledger.base.files, research: ledger.research, humanAcceptance: ledger.humanAcceptance, accepted: ["E01", "E03"], excluded: ["E02"], retainedClaims: base.claims.length } };
}
export async function loadEventPilot() {
  const prepared = await prepareEventPilot();
  if (await readFile(`${EVENT_DIRECTORY}/data.json`, "utf8") !== prepared.data || await readFile(`${EVENT_DIRECTORY}/manifest.json`, "utf8") !== jsonFile(prepared.manifest)) throw new Error("Event data/manifest differs from accepted ledger");
  return prepared.fixture;
}
