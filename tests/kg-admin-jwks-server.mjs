// TLS JWKS fixture in a disposable Docker network; never part of the web image.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
createServer({key:readFileSync('/test/key.pem'),cert:readFileSync('/test/cert.pem')},(req,res)=>{
  if(req.url!=='/cdn-cgi/access/certs'){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(readFileSync('/test/jwks.json'));
}).listen(443,'0.0.0.0');
