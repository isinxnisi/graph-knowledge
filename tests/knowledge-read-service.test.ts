import { expect,it,vi,afterEach } from "vitest";
import type { Pool } from "pg";
import type { Driver } from "neo4j-driver";
import { createKnowledgePublicationService } from "../lib/server/knowledge-publication";
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('NOT_FOUND_PAGE');}}));
import { themePageGuard } from "../lib/server/theme-page-guard";
afterEach(()=>vi.unstubAllEnvs());
it('明示検証済みの読取serviceはschemaを書き換えず公開状態を読める',async()=>{
 const queries:string[]=[];const query=async(sql:string)=>{queries.push(sql);if(/\b(CREATE|INSERT|UPDATE|DELETE)\b|pg_advisory/i.test(sql))throw Error('Read-only connection');return {rows:sql.includes('max(sequence)')?[{n:'0',count:'0'}]:[],rowCount:0};};
 const prepare=vi.fn().mockResolvedValue(undefined),connection={query,release:vi.fn()};const pool={connect:async()=>connection} as unknown as Pool;
 const reader=createKnowledgePublicationService(pool,{} as Driver,{}, {prepareSchema:prepare});
 expect((await reader.status()).active).toBeNull();expect((await reader.status()).pending).toBe(true);expect(prepare).toHaveBeenCalledOnce();expect(queries).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
});
it('ローカル専用画面はβで404となり、3276のoperator画面は維持する',()=>{
 vi.stubEnv('THEME_WORKBENCH_ENABLED','0');expect(()=>themePageGuard()).toThrow('NOT_FOUND_PAGE');
 vi.stubEnv('THEME_WORKBENCH_ENABLED','1');vi.stubEnv('THEME_ORIGIN','http://localhost:3276');expect(()=>themePageGuard()).not.toThrow();
});
