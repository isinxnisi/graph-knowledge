import {readFile,stat} from 'node:fs/promises';
import {z} from 'zod';
import {automationFailure} from './theme-automation';

const maxImage=8*1024*1024;
const maxResponse=12*1024*1024;
export const defaultThemeImageModel='gpt-image-2.6-flare';
const imageUsage=z.object({
  total_tokens:z.number().int().nonnegative(),input_tokens:z.number().int().nonnegative(),output_tokens:z.number().int().nonnegative(),
  input_tokens_details:z.object({text_tokens:z.number().int().nonnegative(),image_tokens:z.number().int().nonnegative()}).optional(),
  output_tokens_details:z.object({text_tokens:z.number().int().nonnegative(),image_tokens:z.number().int().nonnegative()}).optional(),
});
const providerRequestId=z.string().regex(/^req_[A-Za-z0-9_-]{1,150}$/);
type GeneratedImage={bytes:Buffer;usage?:z.infer<typeof imageUsage>|null;providerRequestId?:string|null};
export type ThemeImageGenerator={
  name:string;model:string;dailyLimit:number;generate(prompt:string,attemptId:string):Promise<GeneratedImage>;
};

async function imageResponse(response:Response){
  const reader=response.body?.getReader();
  if(!reader)throw automationFailure('IMAGE_GENERATION_UNKNOWN','画像応答を確認できません。');
  let size=0;
  const chunks:Uint8Array[]=[];
  try{
    for(;;){
      const part=await reader.read();
      if(part.done)break;
      size+=part.value.byteLength;
      if(size>maxResponse){await reader.cancel();throw automationFailure('IMAGE_RESPONSE_TOO_LARGE','画像応答が大きすぎます。');}
      chunks.push(part.value);
    }
  }finally{reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}

export function createOpenAiThemeImageGenerator(key:string,model:string,dailyLimit:number,send:typeof fetch=fetch):ThemeImageGenerator{
  return {name:'openai',model,dailyLimit,async generate(prompt,attemptId){
    const response=await send('https://api.openai.com/v1/images/generations',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(210_000),
      headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','X-Client-Request-Id':attemptId},
      body:JSON.stringify({model,prompt,n:1,size:'1536x1024',quality:'medium',output_format:'jpeg',output_compression:88}),
    });
    if(!response.ok){
      await response.body?.cancel();
      const code=response.status===429?'IMAGE_PROVIDER_RATE_LIMIT':response.status>=500?'IMAGE_GENERATION_UNKNOWN':'IMAGE_PROVIDER_REJECTED';
      throw automationFailure(code,'画像生成サービスが要求を完了できませんでした。');
    }
    const data=z.object({
      data:z.array(z.object({b64_json:z.base64().max(Math.ceil(maxImage/3)*4)})).length(1),
      usage:z.unknown().optional(),
    }).parse(JSON.parse(await imageResponse(response)));
    const bytes=Buffer.from(data.data[0].b64_json,'base64');
    if(bytes.length>maxImage)throw automationFailure('IMAGE_RESPONSE_TOO_LARGE','画像応答が大きすぎます。');
    return {bytes,usage:imageUsage.safeParse(data.usage).data??null,providerRequestId:providerRequestId.safeParse(response.headers.get('x-request-id')).data??null};
  }};
}

export function configuredThemeImageGenerator(env:Record<string,string|undefined>,environment:'beta'|'production'):ThemeImageGenerator|null{
  const mode=env.THEME_IMAGE_PROVIDER;
  if(!mode)return null;
  if(mode==='fixture'&&environment==='beta'&&env.GRAPH_DEPLOYMENT!=='production'){
    const path=env.THEME_IMAGE_FIXTURE_PATH;
    if(!path)throw Error('THEME_IMAGE_FIXTURE_PATH required');
    return {name:'fixture',model:'fixture-v1',dailyLimit:20,async generate(){
      const file=await stat(path);
      if(!file.isFile()||file.size>maxImage)throw automationFailure('IMAGE_FIXTURE_INVALID','検証用画像を確認してください。');
      return {bytes:await readFile(path)};
    }};
  }
  const key=env.THEME_IMAGE_OPENAI_API_KEY;
  const model=env.THEME_IMAGE_OPENAI_MODEL??defaultThemeImageModel;
  const limit=Number(env.THEME_IMAGE_DAILY_LIMIT);
  if(mode!=='openai'||env.THEME_IMAGE_PAID_ENABLED!=='1'||!key||!/^gpt-image-[a-z0-9.-]{1,70}$/.test(model)||!Number.isSafeInteger(limit)||limit<1||limit>100){
    throw Error('Explicit image provider approval, key, model and daily limit are required');
  }
  return createOpenAiThemeImageGenerator(key,model,limit);
}
