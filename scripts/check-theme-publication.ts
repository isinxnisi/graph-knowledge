/** GET-only targeted check. Bundle this entry for Windows when WSL DNS is unavailable. */
import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {checkThemePublication,type ThemePageExpectation} from '../lib/server/theme-publication-check';
const {values}=parseArgs({options:{input:{type:'string'}}});
if(!values.input)throw Error('--input must name a JSON file with {origin,expectations}');
const v=JSON.parse(await readFile(values.input,'utf8')) as {origin:string;expectations:ThemePageExpectation[]};
if(!['https://plunode.net','https://graph-beta.isinxnisi.com'].includes(v.origin)||!v.expectations.length||v.expectations.length>4)throw Error('Use one configured public origin and at most four explicit theme/language targets');
const result=await checkThemePublication(v.origin,v.expectations);console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
