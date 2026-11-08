import {Pool} from 'pg';
import {themeRegistrationCommandSchema,type ThemeRegistrationCommand} from '../../domain/knowledge-theme-registration';
import {createKnowledgeImports} from '../knowledge-import';
import {resolveImportPrincipal} from '../knowledge-import-runtime';
import {knowledgeReadConfiguration} from '../knowledge-read-runtime';
import {createWebKnowledgeImports} from '../knowledge-web-import';
import {createThemeRegistrations} from '../knowledge-theme-registration';
import {knowledgeCapability} from '../knowledge-deployment';
import {KnowledgeError} from '../knowledge-foundation';
import {memberRuntime} from './runtime';

let registration:ReturnType<typeof createThemeRegistrations>|undefined;
export function themeRegistrationEnabled(){return process.env.KNOWLEDGE_THEME_REGISTRATION_ENABLED==='1';}
export async function dispatchThemeRegistration(owner:string,raw:ThemeRegistrationCommand){
 if(!themeRegistrationEnabled()||!knowledgeCapability('operator')||!knowledgeCapability('missions'))throw new KnowledgeError('この接続ではテーマを作成できません。',404,'NOT_FOUND');
 if(!registration){const {pool}=memberRuntime(),knowledge=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:2});const imports=createKnowledgeImports(pool,knowledge,(id,c)=>resolveImportPrincipal(pool,id,c));registration=createThemeRegistrations(pool,knowledge,createWebKnowledgeImports(pool,()=>imports),imports);}
 const command=themeRegistrationCommandSchema.parse(raw);
 if(command.action==='theme-status')return registration.status(owner,command.requestId);
 if(command.action==='cancel-theme')return registration.cancel(owner,command.requestId);
 const {action,...input}=command;void action;
 return registration.submit(owner,input);
}
