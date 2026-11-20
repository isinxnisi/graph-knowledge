import {expect,it,vi} from 'vitest';
import {configuredThemeImageGenerator,createOpenAiThemeImageGenerator} from '../lib/server/theme-image-generator';

it('uses one bounded OpenAI request and returns data as image bytes',async()=>{
 const usage={total_tokens:423,input_tokens:17,output_tokens:406,input_tokens_details:{text_tokens:17,image_tokens:0}};
 const fake=vi.fn<typeof fetch>().mockResolvedValue(Response.json({data:[{b64_json:'AQID'}],usage},{headers:{'x-request-id':'req_fixture'}}));
 const generator=createOpenAiThemeImageGenerator('fixture-key','gpt-image-2.6-flare',2,fake);
 expect(await generator.generate('An isolated fixture illustration','attempt')).toEqual({bytes:Buffer.from([1,2,3]),usage,providerRequestId:'req_fixture'});
 const [url,init]=fake.mock.calls[0];
 expect(url).toBe('https://api.openai.com/v1/images/generations');
 expect(init?.redirect).toBe('error');
 expect(JSON.parse(String(init?.body))).toMatchObject({model:'gpt-image-2.6-flare',n:1,quality:'medium',output_format:'jpeg'});
 expect(new Headers(init?.headers).get('X-Client-Request-Id')).toBe('attempt');
});

it('leaves real generation disabled by default and requires separate approval and quantity limit',()=>{
 expect(configuredThemeImageGenerator({},'production')).toBeNull();
 expect(()=>configuredThemeImageGenerator({THEME_IMAGE_PROVIDER:'openai',THEME_IMAGE_OPENAI_API_KEY:'fixture'},'beta')).toThrow();
 expect(()=>configuredThemeImageGenerator({THEME_IMAGE_PROVIDER:'fixture',THEME_IMAGE_FIXTURE_PATH:'fixture.png'},'production')).toThrow();
 expect(configuredThemeImageGenerator({THEME_IMAGE_PROVIDER:'fixture',THEME_IMAGE_FIXTURE_PATH:'fixture.png'},'beta')?.name).toBe('fixture');
});


it('keeps unknown metering distinct from zero and drops invalid provider identifiers',async()=>{
 const fake=vi.fn<typeof fetch>().mockResolvedValue(Response.json({data:[{b64_json:'AQID'}],usage:{total_tokens:-1}},
  {headers:{'x-request-id':'not-a-provider-id'}}));
 const generated=await createOpenAiThemeImageGenerator('fixture-key','gpt-image-2.6-flare',2,fake).generate('Fixture prompt','attempt');
 expect(generated).toEqual({bytes:Buffer.from([1,2,3]),usage:null,providerRequestId:null});
});
