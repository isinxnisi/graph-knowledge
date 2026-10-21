// Preserve the existing Tunnel origin and earlier local review links.
// Both listeners stay on loopback; the application still enforces its own Host/API boundary.
import http from 'node:http';
const domain='graph-ailab.isinxnisi.com';
const hosts=new Set([domain,'127.0.0.1:3286','localhost:3286']);
export function legacyPort(){
 return http.createServer((req,res)=>{
  if(!hosts.has(req.headers.host)){res.writeHead(404,{'Cache-Control':'no-store'});res.end();return;}
  const headers={...req.headers,host:req.headers.host===domain?domain:'127.0.0.1:3268'};
  const upstream=http.request({hostname:'127.0.0.1',port:3268,path:req.url,method:req.method,headers},reply=>{
   res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
  });
  upstream.setTimeout(30000,()=>upstream.destroy());
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Cache-Control':'no-store'});res.end();});
  req.on('aborted',()=>upstream.destroy());
  res.on('close',()=>upstream.destroy());
  req.pipe(upstream);
 });
}
