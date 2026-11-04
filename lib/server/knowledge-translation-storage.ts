import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {knowledgeOriginalText,translationIdentity,translationTextLimit,type KnowledgeTextTarget,type KnowledgeTranslationVersion} from "../domain/knowledge-translation";
export const translationHash=(text:string)=>createHash('sha256').update(text).digest('hex');
export const translationId=(target:KnowledgeTextTarget,language:string)=>'translation:'+translationHash(JSON.stringify(translationIdentity(target,language))).slice(0,48);
export type TranslationOriginal={text:string;language?:{tag:string;basis:string}};
export async function storedTranslation(c:PoolClient,id:string,revision?:number):Promise<KnowledgeTranslationVersion|null>{
 const r=(await c.query('SELECT h.target,h.language,r.* FROM knowledge75.text_translation_heads h JOIN knowledge75.text_translation_revisions r ON r.id=h.id AND r.revision=COALESCE($2::integer,h.current_revision) WHERE h.id=$1 AND h.visibility=\'public\'',[id,revision??null])).rows[0];
 return r?{id:r.id,revision:r.revision,target:r.target,language:r.language,text:r.text,originalText:r.original_text,originalHash:r.original_hash,reason:r.reason,createdAt:r.created_at.toISOString()}:null;
}
export async function putTranslation(c:PoolClient,cmd:{target:KnowledgeTextTarget;language:string;text:string;originalHash:string;expectedRevision:number;reason:string},actor:{id:string;kind:string},content:unknown){
 const original=knowledgeOriginalText(cmd.target,content);
 if(translationHash(original.text)!==cmd.originalHash)throw Error('翻訳元の内容が一致しません');
 if(original.language?.tag===cmd.language)throw Error('原文と異なる訳文の言語を選んでください');
 if(cmd.text.length>translationTextLimit(cmd.target))throw Error('訳文が対象項目の文字数上限を超えています');
 const id=translationId(cmd.target,cmd.language),head=(await c.query('SELECT * FROM knowledge75.text_translation_heads WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(head?.visibility==='hidden')throw Error('この訳文は公開停止中です');
 if((head?.current_revision??0)!==cmd.expectedRevision)throw Error('訳文が更新されています。最新版を確認してください');
 const old=head?await storedTranslation(c,id):null;
 if(old?.text===cmd.text)return {...old,disposition:'existing' as const};
 const revision=(head?.current_revision??0)+1;
 if(!head)await c.query('INSERT INTO knowledge75.text_translation_heads(id,target,language,current_revision) VALUES($1,$2,$3,1)',[id,cmd.target,cmd.language]);
 else await c.query('UPDATE knowledge75.text_translation_heads SET current_revision=$2 WHERE id=$1',[id,revision]);
 await c.query('INSERT INTO knowledge75.text_translation_revisions(id,revision,text,original_text,original_hash,reason,actor_kind,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,revision,cmd.text,original.text,cmd.originalHash,cmd.reason,actor.kind,actor.id]);
 return {...(await storedTranslation(c,id,revision))!,disposition:head?'updated' as const:'created' as const};
}
