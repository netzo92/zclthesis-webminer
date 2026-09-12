// Static-only local preview. Does not start a bridge or connect to a pool.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files=new Map([['/mine/','public/index.html'],['/mine/es/','public/es/index.html'],['/mine/app.mjs','public/app.mjs'],['/mine/style.css','public/style.css'],...['miner-worker.mjs','solver.mjs','solver-reference.mjs','solver-shaders.mjs','protocol.mjs'].map(f=>['/mine/src/'+f,'src/'+f])]);
http.createServer(async(req,res)=>{try{const file=files.get(new URL(req.url,'http://localhost').pathname);if(!file){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(await readFile(new URL('../'+file,import.meta.url)));}catch{res.writeHead(500);res.end();}}).listen(Number(process.env.ZCL_PREVIEW_PORT||8788),'127.0.0.1',()=>console.log('Static miner preview ready'));
