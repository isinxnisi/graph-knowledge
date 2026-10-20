import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/':['index.html','text/html; charset=utf-8'],'/app.mjs':['app.mjs','text/javascript; charset=utf-8'],'/model.mjs':['model.mjs','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:3275');
 const file=files[u.pathname];
 if(req.method!=='GET'||!file||!['127.0.0.1:3275','localhost:3275'].includes(req.headers.host)){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"});
 res.end(await readFile(new URL(file[0],import.meta.url)));
}).listen(3275,'127.0.0.1',()=>console.log('Community prototype: http://127.0.0.1:3275 — fixtures only; no API or AI connection'));
