import http from 'node:http';
import {createReadStream,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||8000);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8'};
const server=http.createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end('Bad request');return;}
  if(pathname==='/')pathname='/index.html';
  const file=path.resolve(root,'.'+pathname);
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  try{if(!statSync(file).isFile())throw new Error('not a file');}catch{res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  createReadStream(file).pipe(res);
});
server.listen(port,'127.0.0.1',()=>console.log(`КОМПАС Онлайн открыт: http://127.0.0.1:${port}/`));
server.on('error',e=>{console.error(`Не удалось запустить сервер: ${e.message}`);process.exitCode=1;});
