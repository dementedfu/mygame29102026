import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('public');await mkdir('.local',{recursive:true});
http.createServer(async(req,res)=>{try{
 if(req.url==='/api/state'){
 if(req.method==='GET'){let s='null';try{s=await readFile('.local/state.json','utf8')}catch{}res.setHeader('Content-Type','application/json');return res.end(s)}
 if(req.method==='PUT'){let b='';for await(const c of req){b+=c;if(b.length>1000000){res.writeHead(413);return res.end()}}JSON.parse(b);await writeFile('.local/state.json',b);return res.end('{}')}
 }
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.writeHead(404);res.end('Not found')}}).listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Игра запущена, порт '+(process.env.PORT||3000)));
