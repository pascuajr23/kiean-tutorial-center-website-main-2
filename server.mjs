import http from 'node:http';
import {chmod,mkdir,readFile,rename,unlink,writeFile} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {loadConfig,publicConfig,validateTeacherRoster,validateBranches,validatePrograms,validateGalleries} from './lib/config.mjs';
import {DEFAULT_PROGRAMS,DEFAULT_GALLERIES,setPrograms} from './shared.mjs';
import {GoogleCalendar} from './lib/calendar.mjs';
import {GoogleOAuth,CENTER_SCOPES} from './lib/google-oauth.mjs';
import {GmailMailer,CENTER_ID} from './lib/mailer.mjs';
import {BookingStore} from './lib/store.mjs';
import {BookingService} from './lib/booking-service.mjs';
import {BookingError,validateAttachments} from './lib/domain.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
const PUBLIC=new Set(['index.html','booking.html','faq.html','payment.html','privacy-policy.html','terms.html','refund-policy.html','cookie-policy.html','consent-form.html','legal.js','robots.txt','sitemap.xml','style.css','booking.css','site.js','booking.js','shared.mjs','admin.css','admin-responsive.css','admin.js']);
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
// Compare secrets in constant time; a length mismatch still compares against itself so timing stays flat.
function sameSecret(given,expected){const a=Buffer.from(String(given??'')),b=Buffer.from(String(expected));return timingSafeEqual(a.length===b.length?a:b,b)&&a.length===b.length;}
const SESSION_MS=8*3600000;
export function createApp({config,service,store,oauth,calendar,adminCredentials={username:process.env.KIEAN_ADMIN_USER,password:process.env.KIEAN_ADMIN_PASSWORD},configPath,photosDir=resolve(process.env.KIEAN_DATA_DIR||'data','branch-photos')}={}){
  // Configs built without programs (tests, older files) use the defaults; the live list is module state in shared.mjs.
  config.programs??=structuredClone(DEFAULT_PROGRAMS);setPrograms(config.programs);
  const rate=new Map();
  const oauthStates=new Map();
  // shortcut: admin sessions live in memory, so a server restart signs staff out; move to SQLite if that matters.
  const sessions=new Map();
  const sessionOf=req=>{const token=req.headers.cookie?.match(/(?:^|;\s*)kiean_admin=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];if(!token)return null;if(sessions.get(token)>Date.now())return token;sessions.delete(token);return null;};
  // Signed in through the sign-in page (cookie), or Basic auth for scripts and tests.
  const isAdmin=req=>Boolean(sessionOf(req))||hasAdminCredentials(req,adminCredentials);
  const cookieFlags=`Path=/; HttpOnly; SameSite=Strict${config?.publicOrigin?.startsWith('https:')?'; Secure':''}`;
  const timer=setInterval(()=>{for(const [ip,r]of rate)if(Date.now()-r.since>3600000)rate.delete(ip);for(const [t,exp]of sessions)if(exp<=Date.now())sessions.delete(t);},60000);timer.unref();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://nominatim.openstreetmap.org; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'");
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
    try{
      const url=new URL(req.url,'http://localhost');
      // Container health check: no database work, no rate limit.
      if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('ok');return;}
      if(url.pathname==='/admin'){
        if(!['GET','HEAD'].includes(req.method))throw new BookingError('Method not allowed.',405);
        if(!adminCredentials.username||!adminCredentials.password)throw new BookingError('Admin sign-in is not configured on this server.',503);
        if(!isAdmin(req)){
          // Fixed message only (never echo request input into the page).
          const page=(await readFile(resolve(root,'admin-login.html'),'utf8')).replace('<!--ERROR-->',url.searchParams.get('error')==='1'?'<p class="admin-message" data-kind="error" role="alert">That username or password is not right. Please try again.</p>':url.searchParams.get('signedout')==='1'?'<p class="admin-message" data-kind="success" role="status">You have signed out.</p>':'');
          res.writeHead(401,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?undefined:page);return;
        }
        if(config.preview)throw new BookingError('Teacher management is available only in live mode.',503);
        const page=await readFile(resolve(root,'admin.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?undefined:page);return;
      }
      if(url.pathname.startsWith('/api/')){
        if(!['GET','POST'].includes(req.method))throw new BookingError('Method not allowed.',405);
        const ip=process.env.TRUST_PROXY==='1'?(req.headers['x-forwarded-for']?.split(',').at(-1)?.trim()||req.socket.remoteAddress):req.socket.remoteAddress;
        const now=Date.now();let bucket=rate.get(ip);if(!bucket||now-bucket.since>3600000){bucket={since:now,reads:0,writes:0};rate.set(ip,bucket);}
        const field=req.method==='POST'?'writes':'reads';bucket[field]++;
        // Signed-in admins save settings repeatedly; only anonymous traffic and sign-in attempts count toward the limit.
        if(url.pathname.startsWith('/api/admin/')&&url.pathname!=='/api/admin/login'&&isAdmin(req))bucket[field]--;
        else if(bucket[field]>(field==='writes'?10:600))throw new BookingError('Too many requests. Please wait before trying again.',429);
        if(req.method==='POST'&&(url.pathname==='/api/admin/login'||url.pathname==='/api/admin/logout')){
          if(!adminCredentials.username||!adminCredentials.password)throw new BookingError('Admin sign-in is not configured on this server.',503);
          if(req.headers.origin!==config.publicOrigin)throw new BookingError('Sign in from the KieAn website.',403);
          if(url.pathname==='/api/admin/logout'){
            const token=sessionOf(req);if(token)sessions.delete(token);
            res.writeHead(303,{'Location':'/admin?signedout=1','Set-Cookie':`kiean_admin=; ${cookieFlags}; Max-Age=0`});res.end();return;
          }
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2000)throw new BookingError('Sign-in details are too long.',413);chunks.push(chunk);}
          const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
          // Check both fields every time (bitwise &) so a wrong username takes as long as a wrong password.
          if(sameSecret(form.get('username'),adminCredentials.username)&sameSecret(form.get('password'),adminCredentials.password)){
            const token=randomBytes(32).toString('base64url');sessions.set(token,Date.now()+SESSION_MS);
            res.writeHead(303,{'Location':'/admin','Set-Cookie':`kiean_admin=${token}; ${cookieFlags}; Max-Age=${SESSION_MS/1000}`});res.end();return;
          }
          res.writeHead(303,{'Location':'/admin?error=1'});res.end();return;
        }
        const adminApi=url.pathname==='/api/admin/teachers'||url.pathname==='/api/admin/branches'||url.pathname==='/api/admin/programs'||url.pathname==='/api/admin/galleries'||url.pathname==='/api/admin/branch-photos';
        if(adminApi){
          if(config.preview)throw new BookingError('Teacher management is available only in live mode.',503);
          if(!adminCredentials.username||!adminCredentials.password)throw new BookingError('Admin sign-in is not configured on this server.',503);
          if(!isAdmin(req))throw new BookingError('Your admin session has ended. Please sign in again.',401);
          if(req.method==='POST'&&req.headers.origin!==config.publicOrigin)throw new BookingError('Settings must be saved from the KieAn website.',403);
        }
        const readJson=async limit=>{
          if(!req.headers['content-type']?.startsWith('application/json'))throw new BookingError('JSON is required.',415);
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new BookingError('The upload is too large.',413);chunks.push(chunk);}
          try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new BookingError('Invalid data.');}
        };
        // Save config.json atomically (write a temp file, then rename) so a crash never leaves it half-written.
        const saveConfig=async changes=>{
          const file=config.configFile||configPath;
          if(!file)throw new BookingError('The live configuration file path is unavailable.',503);
          const persisted={...config,...changes};delete persisted.preview;delete persisted.port;delete persisted.configFile;
          const temporary=`${file}.${randomUUID()}.tmp`;
          try{await writeFile(temporary,JSON.stringify(persisted,null,2)+'\n',{flag:'wx',mode:0o600});await chmod(temporary,0o600);await rename(temporary,file);}
          catch(error){await unlink(temporary).catch(()=>{});throw error;}
          Object.assign(config,changes);
        };
        // Deleting is a deliberate second step: the saved item must already be disabled, only one goes per save,
        // and the request must carry its exact name as typed by the admin. Anything else is refused.
        const checkRemoval=(kind,current,next,remove)=>{
          const ids=new Set(next.map(x=>x.id)),removed=current.filter(x=>!ids.has(x.id));
          if(!removed.length)return null;
          if(removed.length>1)throw new BookingError(`Delete one ${kind} at a time.`,409);
          const [item]=removed;
          if(item.available!==false)throw new BookingError(`${item.name} is still accepting bookings. Turn off “Accepting bookings” and save first; only disabled ${kind}s can be deleted.`,409);
          if(typeof remove?.id!=='string'||remove.id!==item.id||remove.name!==item.name)throw new BookingError(`To delete ${item.name}, type its exact name.`,409);
          return item;
        };
        if(url.pathname==='/api/admin/branches'){
          if(req.method==='GET'){json(200,{branches:config.branches});return;}
          const body=await readJson(200000);
          let branches;try{branches=validateBranches(body?.branches);}catch(error){throw new BookingError(error.message);}
          const gone=checkRemoval('location',config.branches,branches,body.remove);
          if(gone&&config.teachers.some(t=>t.branches.includes(gone.id)))throw new BookingError(`${gone.name} still has teachers. Move them to another location first.`,409);
          await saveConfig({branches});json(200,{branches});return;
        }
        if(url.pathname==='/api/admin/programs'){
          if(req.method==='GET'){json(200,{programs:config.programs});return;}
          const body=await readJson(300000);
          let programs;try{programs=validatePrograms(body?.programs,config.programs);}catch(error){throw new BookingError(error.message);}
          const gone=checkRemoval('program',config.programs,programs,body.remove);
          if(gone&&(config.branches.some(b=>b.programs.includes(gone.id))||config.teachers.some(t=>t.programs.includes(gone.id)||Object.values(t.weekly).flat().some(range=>range[2]===gone.id))))throw new BookingError(`${gone.name} is still offered by a teacher or location. Remove it there first.`,409);
          // Teachers and locations must still be valid with the new list before it replaces the live one.
          setPrograms(programs);
          try{validateBranches(config.branches);validateTeacherRoster(structuredClone(config.teachers),config.branches);await saveConfig({programs});}
          catch(error){setPrograms(config.programs);throw error instanceof BookingError||!error.code?new BookingError(error.message,409):error;}
          json(200,{programs});return;
        }
        if(url.pathname==='/api/admin/galleries'){
          if(req.method==='GET'){json(200,{galleries:config.galleries||DEFAULT_GALLERIES});return;}
          const body=await readJson(100000);
          let galleries;try{galleries=validateGalleries(body?.galleries);}catch(error){throw new BookingError(error.message);}
          await saveConfig({galleries});json(200,{galleries});return;
        }
        if(url.pathname==='/api/admin/branch-photos'&&req.method==='POST'){
          // Same checks as booking attachments: real JPG/PNG/WebP, 5 MB at most (PDFs refused).
          const body=await readJson(7500000);
          let file;try{[file]=validateAttachments([{kind:'request',name:'photo',type:body?.type,data:body?.data}]);}catch(error){throw new BookingError(error.message,error.status);}
          if(!file||file.type==='application/pdf')throw new BookingError('Photos must be JPG, PNG or WebP images.');
          const name=`${randomBytes(12).toString('hex')}.${{'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]}`;
          await mkdir(photosDir,{recursive:true,mode:0o700});await writeFile(resolve(photosDir,name),file.data,{flag:'wx',mode:0o600});
          json(200,{path:`branch-photos/${name}`});return;
        }
        if(url.pathname==='/api/admin/teachers'){
          if(req.method==='GET'){
            json(200,{programs:config.programs,galleries:config.galleries||DEFAULT_GALLERIES,branches:config.branches,teachers:config.teachers.map(t=>({...t,googleConnected:Boolean(store?.hasGoogleToken(t.id))})),center:{email:config.centerEmail||null,connected:Boolean(store?.hasGoogleToken(CENTER_ID))}});return;
          }
          const body=await readJson(100000);
          if(!Array.isArray(body?.teachers))throw new BookingError('A teacher list is required.');
          let teachers;try{teachers=validateTeacherRoster(body.teachers.map(({id,name,bio,googleEmail,available,programs,branches,weekly,blackoutDates})=>({id,name,bio,googleEmail,available,programs,branches,weekly,blackoutDates})),config.branches);}catch(error){throw new BookingError(error.message);}
          const nextById=new Map(teachers.map(t=>[t.id,t]));
          const gone=checkRemoval('teacher',config.teachers,teachers,body.remove);
          // Keep a teacher who still has upcoming sessions: their bookings and calendar events depend on the record.
          if(gone&&store?.busy(gone.id,new Date().toISOString(),'9999-12-31T00:00:00.000Z').length)throw new BookingError(`${gone.name} still has upcoming sessions. Keep the teacher disabled until those sessions are over.`,409);
          for(const current of config.teachers){
            const next=nextById.get(current.id);
            if(!next)continue;
            const linked=store?.googleToken(current.id);
            if(linked&&linked.email!==next.googleEmail.toLowerCase())throw new BookingError('A connected teacher Google email cannot be changed. Reconnect or contact support first.',409);
          }
          await saveConfig({teachers});
          if(gone)store?.deleteGoogleToken(gone.id);
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
          const teacher=pending.teacherId===CENTER_ID?(config.centerEmail&&{id:CENTER_ID,googleEmail:config.centerEmail}):config.teachers.find(t=>t.id===pending.teacherId),code=url.searchParams.get('code');
          if(!teacher||!code){finish('Google did not return a valid authorization. Start again from the teacher connection link.',400);return;}
          try{
            const linked=await oauth.exchange(code,pending.codeVerifier);
            if(linked.email!==teacher.googleEmail.toLowerCase()){finish('The signed-in Google account does not match the email configured for this teacher.',403);return;}
            if(!linked.refreshToken)throw new Error('Google did not issue offline access. Revoke the existing KieAn connection and try again.');
            store.saveGoogleToken(teacher.id,linked.email,linked.refreshToken);
            calendar?.clearToken(teacher.id);
            finish(teacher.id===CENTER_ID?'Center Google account is connected. Booking emails and online invitations will come from this account. You can close this page.':'Google Calendar access is connected. You can close this page.');
          }catch(error){console.error('Google OAuth callback failed:',error.message);finish('The Google connection could not be completed. Check the server configuration and try again.',503);}
          return;
        }
        const connect=url.pathname.match(/^\/api\/teachers\/([a-z0-9-]+)\/google\/connect$/),connectCenter=url.pathname==='/api/center/google/connect';
        if(req.method==='GET'&&(connect||connectCenter)){
          if(config.preview||!oauth||!store)throw new BookingError('Google Calendar connection is available only in live mode.',503);
          if(connectCenter){
            if(!isAdmin(req)){res.writeHead(303,{'Location':'/admin'});res.end();return;}
            if(!config.centerEmail)throw new BookingError('Set centerEmail in the configuration first.',503);
          }
          const teacher=connectCenter?{id:CENTER_ID}:config.teachers.find(t=>t.id===connect[1]);
          if(!teacher)throw new BookingError('Teacher not found.',404);
          for(const [key,value]of oauthStates)if(value.expires<Date.now())oauthStates.delete(key);
          if(oauthStates.size>=1000)throw new BookingError('Too many connection requests. Try again shortly.',429);
          const state=randomBytes(32).toString('base64url'),codeVerifier=randomBytes(32).toString('base64url');oauthStates.set(state,{teacherId:teacher.id,codeVerifier,expires:Date.now()+600000});
          res.writeHead(302,{'Location':oauth.authorizationUrl(state,codeVerifier,connectCenter?CENTER_SCOPES:undefined),'Set-Cookie':`kiean_oauth_state=${state}; Path=/api/google/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,'Cache-Control':'no-store'});res.end();return;
        }
        if(req.method==='GET'&&url.pathname==='/api/availability'){
          if(config.preview)throw new BookingError('Live availability is not connected.',503);
          json(200,await service.availability(Object.fromEntries(url.searchParams)));return;
        }
        if(req.method==='POST'&&url.pathname==='/api/bookings'){
          if(config.preview)throw new BookingError('Preview mode does not accept bookings or write to Google Calendar.',503);
          if(req.headers.origin!==config.publicOrigin)throw new BookingError('Booking requests must come from the KieAn website.',403);
          if(!req.headers['content-type']?.startsWith('application/json'))throw new BookingError('JSON is required.',415);
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>21000000)throw new BookingError('Submission is too large. Attachments must total about 15 MB or less.',413);chunks.push(chunk);}
          let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new BookingError('Invalid submission.');}
          json(200,await service.book(body));return;
        }
        throw new BookingError('Not found.',404);
      }
      if(!['GET','HEAD'].includes(req.method))throw new BookingError('Method not allowed.',405);
      // Clean page URLs: /booking serves booking.html; old .html addresses redirect permanently.
      const SLUGS=['booking','faq','payment','privacy-policy','terms','refund-policy','cookie-policy','consent-form'];
      const PAGES={'':'index.html',...Object.fromEntries(SLUGS.map(s=>[s,s+'.html']))},CLEAN={'index.html':'/',...Object.fromEntries(SLUGS.map(s=>[s+'.html','/'+s]))};
      const path=decodeURIComponent(url.pathname).replace(/^\//,'');
      if(CLEAN[path]){res.writeHead(301,{'Location':CLEAN[path]+url.search,'Cache-Control':'no-store'});res.end();return;}
      const name=PAGES[path]??path;
      // Photos uploaded in /admin live in the data folder; random names, so they can be cached for good.
      if(/^branch-photos\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(name)){
        const photo=await readFile(resolve(photosDir,name.slice('branch-photos/'.length)));
        res.writeHead(200,{'Content-Type':types[extname(name)],'Cache-Control':'public, max-age=31536000, immutable'});res.end(req.method==='HEAD'?undefined:photo);return;
      }
      // Serve explicit public files only. Never expose configuration, credentials or SQLite.
      if(!PUBLIC.has(name)&&!/^assets\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/.test(name))throw new BookingError('Not found.',404);
      // Images can be cached for a week; CSS/JS linked with ?v= are versioned, so cache them long. Pages stay uncached.
      const cache=name.startsWith('assets/')?'public, max-age=604800':/\.(css|js|mjs)$/.test(name)?(url.searchParams.has('v')?'public, max-age=31536000, immutable':'no-cache'):'no-store';
      const content=await readFile(resolve(root,name));res.writeHead(200,{'Content-Type':types[extname(name)]||'application/octet-stream','Cache-Control':cache});res.end(req.method==='HEAD'?undefined:content);
    }catch(error){
      if(res.headersSent){res.end();return;}
      // Unknown pages get the friendly 404 page; API callers keep JSON errors.
      const missing=(error instanceof BookingError&&error.status===404)||error.code==='ENOENT';
      if(missing&&!req.url.startsWith('/api/')&&['GET','HEAD'].includes(req.method)){
        const page=await readFile(resolve(root,'404.html')).catch(()=>null);
        if(page){res.writeHead(404,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:page);return;}
      }
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
  const service=config.preview?null:new BookingService(config,store,calendar,{mailer:new GmailMailer({calendar}),uploadsDir:resolve(process.env.KIEAN_DATA_DIR||'data','uploads')});
  const server=createApp({config,service,store,oauth,calendar});
  server.listen(config.port,process.env.HOST||'127.0.0.1',()=>console.log(`KieAn website listening on http://${process.env.HOST||'127.0.0.1'}:${config.port} (${config.preview?'PREVIEW — no calendar writes':'LIVE'})`));
  const stop=()=>server.close(()=>{store?.close();process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
