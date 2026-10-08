import http from 'node:http';
import {chmod,readFile,rename,unlink,writeFile} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {loadConfig,publicConfig,validateTeacherRoster} from './lib/config.mjs';
import {GoogleCalendar} from './lib/calendar.mjs';
import {GoogleOAuth} from './lib/google-oauth.mjs';
import {BookingStore} from './lib/store.mjs';
import {BookingService} from './lib/booking-service.mjs';
import {BookingError} from './lib/domain.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
const PUBLIC=new Set(['index.html','booking.html','style.css','booking.css','site.js','booking.js','shared.mjs','admin.css','admin-responsive.css','admin.js']);
function hasAdminCredentials(req,credentials){
  if(!credentials?.username||!credentials?.password)return false;
  const match=req.headers.authorization?.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if(!match)return false;
  let decoded;try{decoded=Buffer.from(match[1],'base64').toString('utf8');}catch{return false;}
  const separator=decoded.indexOf(':');if(separator<0)return false;
  const username=Buffer.from(decoded.slice(0,separator)),password=Buffer.from(decoded.slice(separator+1));
  const expectedUsername=Buffer.from(credentials.username),expectedPassword=Buffer.from(credentials.password);
  return username.length===expectedUsername.length&&password.length===expectedPassword.length&&timingSafeEqual(username,expectedUsername)&&timingSafeEqual(password,expectedPassword);
}
function challengeAdmin(res){res.writeHead(401,{'WWW-Authenticate':'Basic realm="KieAn Admin", charset="UTF-8"','Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Sign in to manage teacher bookings.');}
export function createApp({config,service,store,oauth,calendar,adminCredentials={username:process.env.KIEAN_ADMIN_USER,password:process.env.KIEAN_ADMIN_PASSWORD},configPath}={}){
  const rate=new Map();
  const oauthStates=new Map();
  const timer=setInterval(()=>{for(const [ip,r]of rate)if(Date.now()-r.since>3600000)rate.delete(ip);},60000);timer.unref();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'");
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/admin'){
        if(!['GET','HEAD'].includes(req.method))throw new BookingError('Method not allowed.',405);
        if(!adminCredentials.username||!adminCredentials.password)throw new BookingError('Admin sign-in is not configured on this server.',503);
        if(!hasAdminCredentials(req,adminCredentials)){challengeAdmin(res);return;}
        if(config.preview)throw new BookingError('Teacher management is available only in live mode.',503);
        const page=await readFile(resolve(root,'admin.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?undefined:page);return;
      }
      if(url.pathname.startsWith('/api/')){
        if(!['GET','POST'].includes(req.method))throw new BookingError('Method not allowed.',405);
        const ip=process.env.TRUST_PROXY==='1'?(req.headers['x-forwarded-for']?.split(',').at(-1)?.trim()||req.socket.remoteAddress):req.socket.remoteAddress;
        const now=Date.now();let bucket=rate.get(ip);if(!bucket||now-bucket.since>3600000){bucket={since:now,reads:0,writes:0};rate.set(ip,bucket);}
        const field=req.method==='POST'?'writes':'reads';bucket[field]++;
        if(bucket[field]>(field==='writes'?10:600))throw new BookingError('Too many requests. Please wait before trying again.',429);
        if(url.pathname==='/api/admin/teachers'){
          if(config.preview)throw new BookingError('Teacher management is available only in live mode.',503);
          if(!adminCredentials.username||!adminCredentials.password)throw new BookingError('Admin sign-in is not configured on this server.',503);
          if(!hasAdminCredentials(req,adminCredentials)){challengeAdmin(res);return;}
          if(req.method==='GET'){
            json(200,{teachers:config.teachers.map(t=>({...t,googleConnected:Boolean(store?.hasGoogleToken(t.id))}))});return;
          }
          if(req.headers.origin!==config.publicOrigin)throw new BookingError('Teacher settings must be saved from the KieAn website.',403);
          if(!req.headers['content-type']?.startsWith('application/json'))throw new BookingError('JSON is required.',415);
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>100000)throw new BookingError('Teacher roster is too large.',413);chunks.push(chunk);}
          let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new BookingError('Invalid teacher roster.');}
          if(!Array.isArray(body?.teachers))throw new BookingError('A teacher list is required.');
          let teachers;try{teachers=validateTeacherRoster(body.teachers.map(({id,name,bio,googleEmail,available,programs,branches,weekly,blackoutDates})=>({id,name,bio,googleEmail,available,programs,branches,weekly,blackoutDates})));}catch(error){throw new BookingError(error.message);}
          const nextById=new Map(teachers.map(t=>[t.id,t]));
          for(const current of config.teachers){
            const next=nextById.get(current.id);
            if(!next)throw new BookingError('Existing teacher records cannot be removed. Turn off booking availability instead.',409);
            const linked=store?.googleToken(current.id);
            if(linked&&linked.email!==next.googleEmail.toLowerCase())throw new BookingError('A connected teacher Google email cannot be changed. Reconnect or contact support first.',409);
          }
          const file=config.configFile||configPath;
          if(!file)throw new BookingError('The live configuration file path is unavailable.',503);
          const persisted={...config,teachers};delete persisted.preview;delete persisted.port;delete persisted.configFile;
          const temporary=`${file}.${randomUUID()}.tmp`;
          try{await writeFile(temporary,JSON.stringify(persisted,null,2)+'\n',{flag:'wx',mode:0o600});await chmod(temporary,0o600);await rename(temporary,file);}
          catch(error){await unlink(temporary).catch(()=>{});throw error;}
          config.teachers=teachers;json(200,{teachers:teachers.map(t=>({...t,googleConnected:Boolean(store?.hasGoogleToken(t.id))}))});return;
        }
        if(req.method==='GET'&&url.pathname==='/api/config'){json(200,publicConfig(config,store));return;}
        if(req.method==='GET'&&url.pathname==='/api/google/callback'){
          const state=url.searchParams.get('state');
          const cookie=req.headers.cookie?.match(/(?:^|;\s*)kiean_oauth_state=([A-Za-z0-9_-]+)/)?.[1];
          const pending=state&&oauthStates.get(state);
          oauthStates.delete(state);
          const clearCookie='kiean_oauth_state=; Path=/api/google/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
          const finish=(message,status=200)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Set-Cookie':clearCookie,'Cache-Control':'no-store'});res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Google Calendar connection</title><body><main><h1>Google Calendar connection</h1><p>${message}</p></main></body></html>`);};
          if(!state||cookie!==state||!pending||pending.expires<Date.now()){finish('This connection link expired or could not be verified. Start again from the teacher connection link.',400);return;}
          if(url.searchParams.has('error')){finish('Google authorization was not completed. Start again if you want to connect this calendar.',400);return;}
          const teacher=config.teachers.find(t=>t.id===pending.teacherId),code=url.searchParams.get('code');
          if(!teacher||!code){finish('Google did not return a valid authorization. Start again from the teacher connection link.',400);return;}
          try{
            const linked=await oauth.exchange(code,pending.codeVerifier);
            if(linked.email!==teacher.googleEmail.toLowerCase()){finish('The signed-in Google account does not match the email configured for this teacher.',403);return;}
            if(!linked.refreshToken)throw new Error('Google did not issue offline access. Revoke the existing KieAn connection and try again.');
            store.saveGoogleToken(teacher.id,linked.email,linked.refreshToken);
            calendar?.clearToken(teacher.id);
            finish('Google Calendar access is connected. You can close this page.');
          }catch(error){console.error('Google OAuth callback failed:',error.message);finish('The Google connection could not be completed. Check the server configuration and try again.',503);}
          return;
        }
        const connect=url.pathname.match(/^\/api\/teachers\/([a-z0-9-]+)\/google\/connect$/);
        if(req.method==='GET'&&connect){
          if(config.preview||!oauth||!store)throw new BookingError('Google Calendar connection is available only in live mode.',503);
          const teacher=config.teachers.find(t=>t.id===connect[1]);
          if(!teacher)throw new BookingError('Teacher not found.',404);
          for(const [key,value]of oauthStates)if(value.expires<Date.now())oauthStates.delete(key);
          if(oauthStates.size>=1000)throw new BookingError('Too many connection requests. Try again shortly.',429);
          const state=randomBytes(32).toString('base64url'),codeVerifier=randomBytes(32).toString('base64url');oauthStates.set(state,{teacherId:teacher.id,codeVerifier,expires:Date.now()+600000});
          res.writeHead(302,{'Location':oauth.authorizationUrl(state,codeVerifier),'Set-Cookie':`kiean_oauth_state=${state}; Path=/api/google/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,'Cache-Control':'no-store'});res.end();return;
        }
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
  const store=config.preview?null:new BookingStore(resolve(process.env.KIEAN_DATA_DIR||'data','bookings.sqlite'),{tokenEncryptionKey:process.env.KIEAN_TOKEN_ENCRYPTION_KEY});
  const oauth=config.preview?null:new GoogleOAuth({clientId:process.env.GOOGLE_OAUTH_CLIENT_ID,clientSecret:process.env.GOOGLE_OAUTH_CLIENT_SECRET,redirectUri:`${config.publicOrigin}/api/google/callback`});
  const calendar=config.preview?null:new GoogleCalendar({store,oauth});
  const service=config.preview?null:new BookingService(config,store,calendar);
  const server=createApp({config,service,store,oauth,calendar});
  server.listen(config.port,process.env.HOST||'127.0.0.1',()=>console.log(`KieAn website listening on http://${process.env.HOST||'127.0.0.1'}:${config.port} (${config.preview?'PREVIEW — no calendar writes':'LIVE'})`));
  const stop=()=>server.close(()=>{store?.close();process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
