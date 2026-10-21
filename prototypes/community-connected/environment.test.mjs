import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const out='/tmp/community-connection-baseline';await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true});
try {for(const width of [1440,390]){const p=await b.newPage({viewport:{width,height:960}});await p.goto('http://127.0.0.1:3200/');await p.getByText('PLUTOから探索する',{exact:true}).waitFor();await p.screenshot({path:`${out}/${width}-baseline-top.png`,fullPage:true});await p.close();}
 const p=await b.newPage();for(const origin of ['http://127.0.0.1:3200','https://graph-beta.isinxnisi.com','http://127.0.0.1:3275','https://graph-com.isinxnisi.com']){const r=await p.request.get(origin);assert.equal(r.status(),200);const d=await p.request.get(origin+'/api/dataset');assert.equal(d.status(),200);console.log(origin,r.status(),JSON.stringify(await d.json()));}
 for(const host of ['invalid.example','graph-com.isinxnisi.com.invalid'])assert.equal((await p.request.get('http://127.0.0.1:3275/',{headers:{Host:host}})).status(),404);
 console.log('PASS Host restriction and baseline capture');
}finally{await b.close();}
