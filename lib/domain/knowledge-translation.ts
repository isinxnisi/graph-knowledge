import {z} from "zod";
import {knowledgeIdSchema,knowledgeRevisionSchema} from "./knowledge-ids";
import {knowledgeLanguageTagSchema,type KnowledgeTextLanguage} from "./knowledge-language";

export const knowledgeTextTargetSchema=z.strictObject({
 kind:z.enum(["entity","source","record","theme"]),id:knowledgeIdSchema,revision:knowledgeRevisionSchema,
 field:z.enum(["name","description","aliases","title","bibliography","assertion","relation","scope","excerpt","locator","timeLabel","timeAxis","timeUnit","timeCoordinateMeaning","timeFrom","timeTo","axisLabel","axisOriginLabel","insetLabel"]),
 timeId:knowledgeIdSchema.optional(),axisId:knowledgeIdSchema.optional(),
 evidenceId:knowledgeIdSchema.optional(),aliasIndex:z.number().int().min(0).max(29).optional(),
}).superRefine((t,c)=>{
 const fields={entity:["name","description","aliases"],source:["title","bibliography"],record:["assertion","relation","scope","excerpt","locator","timeLabel","timeAxis","timeUnit","timeCoordinateMeaning","timeFrom","timeTo"],theme:["title","description","axisLabel","axisOriginLabel","insetLabel"]};
 if((t.field.startsWith("time")!==(t.timeId!==undefined))||(["axisLabel","axisOriginLabel","insetLabel"].includes(t.field)!==(t.axisId!==undefined))||!fields[t.kind].includes(t.field)||((t.field==="aliases")!==(t.aliasIndex!==undefined))||(["excerpt","locator"].includes(t.field)!==(t.evidenceId!==undefined)))c.addIssue({code:"custom",message:"翻訳する項目を確認してください"});
});
export type KnowledgeTextTarget=z.infer<typeof knowledgeTextTargetSchema>;
export const translationLanguageSchema=knowledgeLanguageTagSchema.refine(v=>!["und","mul","zxx"].includes(v),"訳文の言語を選んでください");
export const knowledgeDisplayTranslationsQuerySchema=z.strictObject({targets:z.array(knowledgeTextTargetSchema).max(100),language:translationLanguageSchema});
export const translationProposalSchema=z.strictObject({target:knowledgeTextTargetSchema,language:translationLanguageSchema,text:z.string().trim().max(4000),expectedRevision:z.number().int().nonnegative().default(0)});
export const knowledgeTranslationVersionSchema=z.strictObject({id:knowledgeIdSchema,revision:knowledgeRevisionSchema,target:knowledgeTextTargetSchema,language:translationLanguageSchema,text:z.string().min(1).max(4000),originalText:z.string().min(1).max(4000),originalHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string(),reason:z.string()});
export type KnowledgeTranslationVersion=z.infer<typeof knowledgeTranslationVersionSchema>;
/** Read-only overlay. The canonical translation retains its original target. */
export const knowledgeDisplayTranslationSchema=knowledgeTranslationVersionSchema.extend({displayTarget:knowledgeTextTargetSchema.optional()});
export type KnowledgeDisplayTranslation=z.infer<typeof knowledgeDisplayTranslationSchema>;
export const translationCommandShape={action:z.literal("accept-translation"),target:knowledgeTextTargetSchema,language:translationLanguageSchema,text:z.string().trim().min(1).max(4000),originalHash:z.string().regex(/^[a-f0-9]{64}$/),expectedRevision:z.number().int().nonnegative()};
export function translationIdentity(t:KnowledgeTextTarget,language:string){return [t.kind,t.id,t.revision,t.field,t.evidenceId??null,t.aliasIndex??null,language,...(t.timeId!==undefined||t.axisId!==undefined?["timeline",t.timeId??null,t.axisId??null]:[])];}
export function knowledgeOriginalText(target:KnowledgeTextTarget,content:unknown):{text:string;language?:KnowledgeTextLanguage}{
 const t=knowledgeTextTargetSchema.parse(target),c=content as Record<string,unknown>;
 let value:unknown=c[t.field],language=(c.textLanguages as Record<string,KnowledgeTextLanguage>|undefined)?.[t.field];
 if(t.field==="aliases"){value=(c.aliases as string[]|undefined)?.[t.aliasIndex!];language=(c.textLanguages as {aliases?:KnowledgeTextLanguage[]}|undefined)?.aliases?.[t.aliasIndex!];}
 if(t.evidenceId){const e=(c.evidence as {id:string;excerpt:string;locator:string;textLanguages?:Record<string,KnowledgeTextLanguage>}[]|undefined)?.find(e=>e.id===t.evidenceId);value=e?.[t.field as "excerpt"|"locator"];language=e?.textLanguages?.[t.field];}
 if(t.timeId){
  const time=(c.times as {id:string;time:Record<string,unknown>}[]|undefined)?.find(v=>v.id===t.timeId)?.time;
  const field={timeLabel:"label",timeAxis:"axis",timeUnit:"unit",timeCoordinateMeaning:"coordinateMeaning",timeFrom:"from",timeTo:"to"}[t.field as "timeLabel"];
  // Calendar/numeric coordinates and source notation are not prose to translate.
  value=time&&(t.field==="timeLabel"||t.field==="timeAxis"&&time.kind!=="calendar"||t.field==="timeUnit"&&time.kind==="cycle"||["timeFrom","timeTo","timeCoordinateMeaning"].includes(t.field)&&time.kind==="qualitative")?time[field]:undefined;
  language=undefined;
 }
 if(t.axisId){
  const timeline=c.timeline as {axes:{id:string;label:string;originLabel?:string}[];insets:{axisId:string;label:string}[]}|undefined;
  value=t.field==="insetLabel"?timeline?.insets.find(v=>v.axisId===t.axisId)?.label:timeline?.axes.find(v=>v.id===t.axisId)?.[t.field==="axisLabel"?"label":"originLabel"];
  language=undefined;
 }
 if(typeof value!=="string"||!value.trim()||value.length>4000)throw Error("翻訳対象が空欄、または4000文字を超えています");
 return {text:value,...(language?{language}:{})};
}
export function translationTextLimit(target:KnowledgeTextTarget){return target.axisId?target.field==="axisOriginLabel"?1000:200:target.timeId?300:target.field==="name"||target.field==="aliases"||target.field==="relation"||target.kind==="theme"&&target.field==="title"?200:target.field==="title"?300:target.field==="locator"?1000:target.field==="scope"?3000:4000;}

export const translationTargetKey=(target:KnowledgeTextTarget)=>JSON.stringify(translationIdentity(target,""));
