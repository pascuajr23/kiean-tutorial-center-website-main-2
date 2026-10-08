import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig,publicConfig} from './lib/config.mjs';
import {GoogleCalendar} from './lib/calendar.mjs';
import {BookingStore} from './lib/store.mjs';
import {BookingService} from './lib/booking-service.mjs';
import {BookingError} from './lib/domain.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
const PUBLIC=new Set(['index.html','booking.html','style.css','booking.css','site.js','booking.js','shared.mjs']);
export function createApp({config,service}={}){
  const rate=new Map();
  const timer=setInterval(()=>{for(const [ip,r]of rate)if(Date.now()-r.since>3600000)rate.delete(ip);},60000);timer.unref();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'");
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/')){
        if(!['GET','POST'].includes(req.method))throw new BookingError('Method not allowed.',405);
        const ip=process.env.TRUST_PROXY==='1'?(req.headers['x-forwarded-for']?.split(',').at(-1)?.trim()||req.socket.remoteAddress):req.socket.remoteAddress;
        const now=Date.now();let bucket=rate.get(ip);if(!bucket||now-bucket.since>3600000){bucket={since:now,reads:0,writes:0};rate.set(ip,bucket);}
        const field=req.method==='POST'?'writes':'reads';bucket[field]++;
        if(bucket[field]>(field==='writes'?10:600))throw new BookingError('Too many requests. Please wait before trying again.',429);
        if(req.method==='GET'&&url.pathname==='/api/config'){json(200,publicConfig(config));return;}
        if(req.method==='GET'&&url.pathname==='/api/availability'){
          if(config.preview)throw new BookingError('Live availability is not connected.',503);
          json(200,await service.availability(Object.fromEntries(url.searchParams)));return;
        }
        if(req.method==='POST'&&url.pathname==='/api/bookings'){
          if(config.preview)throw new BookingError('Preview mode does not accept bookings or write to Google Calendar.',503);
          if(req.headers.origin!==config.publicOrigin)throw new BookingError('Booking requests must come from the KieAn website.',403);
          if(!req.headers['content-type']?.startsWith('application/json'))throw new BookingError('JSON is required.',415);
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>20000)throw new BookingError('Submission is too large.',413);chunks.push(chunk);}
          let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new BookingError('Invalid submission.');}
          json(200,await service.book(body));return;
        }
        throw new BookingError('Not found.',404);
      }
      if(!['GET','HEAD'].includes(req.method))throw new BookingError('Method not allowed.',405);
      const name=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
      // Serve explicit public files only. Never expose configuration, credentials or SQLite.
      if(!PUBLIC.has(name)&&!/^assets\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/.test(name))throw new BookingError('Not found.',404);
      const content=await readFile(resolve(root,name));res.writeHead(200,{'Content-Type':types[extname(name)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:content);
    }catch(error){
      if(res.headersSent){res.end();return;}
      if(error instanceof BookingError)json(error.status,{error:error.message,...error.details});
      else if(error.code==='ENOENT')json(404,{error:'Not found.'});
      else {console.error('Request failed:',error.name,error.status||'internal');json(503,{error:'Booking is temporarily unavailable. Please try again or contact the center.'});}
    }
  });
  server.requestTimeout=300000;server.on('close',()=>clearInterval(timer));return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.umask(0o077);
  const config=loadConfig();
  const store=config.preview?null:new BookingStore(resolve(process.env.KIEAN_DATA_DIR||'data','bookings.sqlite'));
  const service=config.preview?null:new BookingService(config,store,GoogleCalendar.fromEnvironment());
  const server=createApp({config,service});
  server.listen(config.port,process.env.HOST||'127.0.0.1',()=>console.log(`KieAn website listening on http://${process.env.HOST||'127.0.0.1'}:${config.port} (${config.preview?'PREVIEW — no calendar writes':'LIVE'})`));
  const stop=()=>server.close(()=>{store?.close();process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
