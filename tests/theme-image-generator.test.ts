import {expect,it,vi} from 'vitest';
import {configuredThemeImageGenerator,createOpenAiThemeImageGenerator} from '../lib/server/theme-image-generator';

it('uses one bounded OpenAI request and returns data as image bytes',async()=>{
 const fake=vi.fn<typeof fetch>().mockResolvedValue(Response.json({data:[{b64_json:'AQID'}]}));
 const generator=createOpenAiThemeImageGenerator('fixture-key','gpt-image-2.6-flare',2,fake);
 expect(await generator.generate('An isolated fixture illustration','attempt')).toEqual(Buffer.from([1,2,3]));
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
