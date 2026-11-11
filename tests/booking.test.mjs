import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BookingStore} from '../lib/store.mjs';
import {BookingService} from '../lib/booking-service.mjs';
import {GoogleCalendar} from '../lib/calendar.mjs';
import {GoogleOAuth,GOOGLE_SCOPES} from '../lib/google-oauth.mjs';
import {validateBooking,validateAttachments} from '../lib/domain.mjs';
import {mime,teacherEmail,parentScheduleEmail,PAYMENT_URL,BUSINESS} from '../lib/mailer.mjs';
import {loadConfig,validateTeacherRoster,validatePrograms,publicConfig} from '../lib/config.mjs';
import {createApp,clientIp} from '../server.mjs';
import {icsForBooking,PREVIEW_TEACHERS,PROGRAMS,DEFAULT_PROGRAMS,DEFAULT_GALLERIES,PORTFOLIO_TEACHERS,setPrograms,kiddieQuote,PERIOD_TYPES,AREAS,DEFAULT_BRANCHES,branchById,areaBranches,matchArea,slotsForDay,manilaDay,sessionRate,addDays,scheduleSummary} from '../shared.mjs';
const NOW=new Date('2030-06-01T00:00:00Z');
const config={preview:false,publicOrigin:'https://kiean.example',leadMinutes:60,branches:structuredClone(DEFAULT_BRANCHES),teachers:[{...PREVIEW_TEACHERS[0],id:'teacher-1',name:'Test Teacher',googleEmail:'teacher@example.test'}]};
const payload=()=>({requestId:randomUUID(),teacher:'teacher-1',program:'online',branch:'online',area:'laguna-pila',dates:['2030-06-03','2030-06-04','2030-06-05','2030-06-06','2030-06-07'],time:'10:00',parentName:'Test Parent',email:'parent@example.test',phone:'+639171234567',studentName:'Learner',grade:'Grade 3',notes:'Reading practice',consent:true,privacyConsent:true});
function fakeCalendar(options={}){return {events:new Map(),creates:0,removes:0,async busy(){if(options.busyError)throw new Error('Offline');return options.busy||[];},async create(b,s){this.creates++;this.events.set(s.date,s);if(options.failAt===this.creates){const e=new Error('Write failed');if(!options.uncertain)e.status=400;throw e;}return {};},async remove(b,s){this.removes++;if(options.deleteError)throw new Error('Offline');this.events.delete(s.date);},invites:0,async createInvite(){this.invites++;return {hangoutLink:'https://meet.google.com/kie-ann-abc'};},async removeInvite(){this.invites--;}};}
function harness(t,options={}){const store=new BookingStore(':memory:');t.after(()=>store.close());const calendar=fakeCalendar(options),service=new BookingService(config,store,calendar);return {store,calendar,service};}
test('five Mon–Fri dates create five equal slots in Philippine Time',async t=>{
  const {service,calendar}=harness(t);const b=await service.book(payload(),NOW);assert.equal(b.sessions.length,5);assert.equal(calendar.events.size,5);assert.equal(b.sessions[0].start,'2030-06-03T02:00:00.000Z');assert.equal(b.sessions[0].end,'2030-06-03T03:00:00.000Z');assert.equal(b.lessonMinutes,50);
});
test('server enforces minimum, uniqueness, range, grade, consent and teacher hours',()=>{
  for(const change of [{dates:payload().dates.slice(0,4)},{dates:Array(5).fill('2030-06-03')},{dates:['2030-02-30',...payload().dates.slice(1)]},{dates:['2030-06-02',...payload().dates.slice(1)]},{time:'17:00'},{time:'10:17'},{grade:'Grade 7'},{consent:false},{privacyConsent:false},{privacyConsent:undefined},{dates:[null,...payload().dates.slice(1)]},{dates:['2031-06-03',...payload().dates.slice(1)]},{teacher:'not-a-teacher'},{email:'invalid'}])assert.throws(()=>validateBooking({...payload(),...change},config,NOW));
});
test('online needs 5 sessions and face-to-face tutoring needs 20',()=>{
  for(const id of ['online','academic','after-school','sped']){
    const program=PROGRAMS.find(p=>p.id===id),dates=program.mode==='online'?payload().dates.slice(0,4):payload().dates;
    assert.equal(program.minSessions,program.mode==='online'?5:20);
    assert.throws(()=>validateBooking({...payload(),program:id,branch:program.mode==='online'?'online':'pila',area:'laguna-pila',dates},config,NOW),new RegExp(`between ${program.minSessions} `));
  }
});
test('slots start only on the whole hour',()=>{
  const teacher={...config.teachers[0],weekly:{1:[['09:30','12:00']]}};
  assert.deepEqual(slotsForDay(teacher,PROGRAMS[0],'2030-06-03',NOW),['10:00','11:00']);
});
test('overlapping time slots and concurrent requests cannot double-book',async t=>{
  const {service,calendar}=harness(t);const a=payload(),b=payload();
  const result=await Promise.allSettled([service.book(a,NOW),service.book(b,NOW)]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(calendar.creates,5);assert.equal(result.find(r=>r.status==='rejected').reason.status,409);
});
test('a Google Calendar conflict on any date rejects the full booking',async t=>{
  const {service,calendar,store}=harness(t,{busy:[{start:'2030-06-05T02:30:00Z',end:'2030-06-05T03:30:00Z'}]});
  await assert.rejects(service.book(payload(),NOW),e=>e.status===409&&e.details.conflicts[0]==='2030-06-05');assert.equal(calendar.creates,0);assert.equal(store.busy('teacher-1','2030-06-01','2030-07-01').length,0);
});
test('calendar read errors fail closed without creating events',async t=>{
  const {service,calendar}=harness(t,{busyError:true});await assert.rejects(service.book(payload(),NOW),/temporarily unavailable/);assert.equal(calendar.creates,0);
});
test('a failed calendar batch removes every event ID in the request',async t=>{
  const {service,calendar,store}=harness(t,{failAt:3});await assert.rejects(service.book(payload(),NOW),/No sessions were confirmed/);assert.equal(calendar.events.size,0);assert.equal(calendar.removes,5);assert.equal(store.busy('teacher-1','2030-06-01','2030-07-01').length,0);
});
test('rollback failures retain holds for staff reconciliation',async t=>{
  const {service,store}=harness(t,{failAt:2,deleteError:true});await assert.rejects(service.book(payload(),NOW),e=>e.status===503&&Boolean(e.details.reference));assert.equal(store.unresolved()[0].status,'review');assert.equal(store.busy('teacher-1','2030-06-01','2030-07-01').length,5);
});
test('uncertain insert outcomes retain holds even after successful deletes',async t=>{
  const {service,store}=harness(t,{failAt:2,uncertain:true});await assert.rejects(service.book(payload(),NOW),e=>e.status===503&&Boolean(e.details.reference));assert.equal(store.unresolved()[0].status,'review');
});
test('retries with one request id reuse the result and do not create duplicates',async t=>{
  const {service,calendar}=harness(t);const request=payload();const a=await service.book(request,NOW),b=await service.book(request,NOW);assert.equal(a.id,b.id);assert.equal(calendar.creates,5);await assert.rejects(service.book({...request,notes:'Changed'},NOW),/different details/);
});
test('pending reservations survive a database reopen',()=>{
  const dir=mkdtempSync(join(tmpdir(),'kiean-'));try{const path=join(dir,'bookings.sqlite');const a=new BookingStore(path);a.reserve(validateBooking(payload(),config,NOW));a.close();const b=new BookingStore(path);assert.equal(b.unresolved().length,1);assert.equal(b.busy('teacher-1','2030-06-01','2030-07-01').length,5);b.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('shared availability intersects every selected date and respects calendar busy times',async t=>{
  const {service}=harness(t,{busy:[{start:'2030-06-04T02:30:00Z',end:'2030-06-04T03:00:00Z'}]});const a=await service.availability({teacher:'teacher-1',program:'online',branch:'online',month:'2030-06',dates:payload().dates.join(',')},NOW);assert(!a.common.includes('10:00'));assert(a.common.includes('11:00'));assert.deepEqual(a.dates['2030-06-02'],[]);
});
test('holidays and lead time use Manila dates even across UTC midnight',()=>{
  assert.equal(manilaDay(new Date('2030-06-02T18:00:00Z')),'2030-06-03');const t={...config.teachers[0],blackoutDates:['2030-06-03']};assert.deepEqual(slotsForDay(t,PROGRAMS[0],'2030-06-03',NOW),[]);assert(!slotsForDay(config.teachers[0],PROGRAMS[0],'2030-06-03',new Date('2030-06-03T01:31:00Z'),60).includes('10:00'));
});
test('ICS exports every session with stable identifiers and UTC times',async t=>{
  const {service}=harness(t);const b=await service.book(payload(),NOW);const ics=icsForBooking(b);assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,5);assert.match(ics,/DTSTART:20300603T020000Z/);assert.match(ics,/DTEND:20300603T030000Z/);assert(ics.split('\r\n').every(line=>Buffer.byteLength(line)<=75));assert(!ics.includes('parent@example.test'));
});
test('Google adapter rejects per-calendar errors and uses valid deterministic ids',async t=>{
  const store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,4).toString('base64')});t.after(()=>store.close());store.saveGoogleToken('teacher-1','teacher@example.test','refresh-token');
  const calendar=new GoogleCalendar({store,oauth:{async refresh(){return {accessToken:'token',expiresIn:3600};}},fetcher:async()=>new Response(JSON.stringify({calendars:{primary:{errors:[{reason:'notFound'}]}}}),{status:200})});
  await assert.rejects(calendar.busy('teacher-1','2030-06-01','2030-06-30'),/could not be verified/);assert.match(calendar.eventId({id:'123'},'2030-06-03'),/^[0-9a-v]{5,1024}$/);
});
test('Google free/busy splits ranges longer than 45 days',async t=>{
  const store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,6).toString('base64')});t.after(()=>store.close());store.saveGoogleToken('teacher-1','teacher@example.test','refresh-token');
  const ranges=[];const calendar=new GoogleCalendar({store,oauth:{async refresh(){return {accessToken:'token',expiresIn:3600};}},fetcher:async(url,init)=>{const body=JSON.parse(init.body);ranges.push([body.timeMin,body.timeMax]);return new Response(JSON.stringify({calendars:{primary:{busy:[{start:body.timeMin,end:body.timeMin}]}}}),{status:200});}});
  const busy=await calendar.busy('teacher-1','2030-06-01T00:00:00.000Z','2030-11-28T00:00:00.000Z');
  assert.equal(ranges.length,4);assert.equal(busy.length,4);assert.ok(ranges.every(([a,b])=>Date.parse(b)-Date.parse(a)<=45*86400000));
  assert.equal(ranges[0][0],'2030-06-01T00:00:00.000Z');assert.equal(ranges.at(-1)[1],'2030-11-28T00:00:00.000Z');
});
test('Google adapter refreshes once and creates private events in the teacher primary calendar',async t=>{
  const calls=[],store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,5).toString('base64')});t.after(()=>store.close());store.saveGoogleToken('teacher-1','teacher@example.test','refresh-token');let refreshes=0;
  const c=new GoogleCalendar({store,oauth:{async refresh(token){assert.equal(token,'refresh-token');refreshes++;return {accessToken:'mock-token',expiresIn:3600};}},fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:'mock-event'}),{status:200});}});
  const b={...validateBooking(payload(),config,NOW),id:'123',reference:'KTC-TEST'};await c.create(b,b.sessions[0]);await c.create(b,b.sessions[1]);assert.equal(refreshes,1);const resource=JSON.parse(calls[0].options.body);assert.match(calls[0].url,/calendars\/primary\/events/);assert.equal(resource.start.timeZone,'Asia/Manila');assert.equal(resource.visibility,'private');assert.equal(resource.transparency,'opaque');assert.equal(resource.attendees,undefined);assert.match(calls[0].url,/sendUpdates=none/);assert.equal(Date.parse(resource.end.dateTime)-Date.parse(resource.start.dateTime),3600000);
});
test('Google OAuth requests offline calendar consent and verifies the signed-in account',async()=>{
  const calls=[],oauth=new GoogleOAuth({clientId:'client-id',clientSecret:'client-secret',redirectUri:'https://kiean.example/api/google/callback',fetcher:async(url,options)=>{calls.push({url,options});return url.includes('/token')?new Response(JSON.stringify({access_token:'access',refresh_token:'refresh'}),{status:200}):new Response(JSON.stringify({email:'teacher@example.test',email_verified:true}),{status:200});}});
  const url=new URL(oauth.authorizationUrl('random-state','verifier'));assert.equal(url.searchParams.get('state'),'random-state');assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert(GOOGLE_SCOPES.includes('https://www.googleapis.com/auth/calendar.events'));
  assert.deepEqual(await oauth.exchange('auth-code','verifier'),{email:'teacher@example.test',refreshToken:'refresh'});assert.equal(calls.length,2);assert.match(calls[1].options.headers.Authorization,/access/);assert.equal(new URLSearchParams(calls[0].options.body).get('code_verifier'),'verifier');
});
test('teacher OAuth refresh tokens are encrypted at rest',t=>{
  const store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,6).toString('base64')});t.after(()=>store.close());store.saveGoogleToken('teacher-1','teacher@example.test','secret-refresh-token');
  assert.deepEqual(store.googleToken('teacher-1'),{email:'teacher@example.test',refreshToken:'secret-refresh-token'});const row=store.db.prepare('SELECT ciphertext FROM teacher_google_tokens').get();assert(!row.ciphertext.includes('secret-refresh-token'));
});
test('HTTP blocks private files, preview submissions and cross-origin writes',async t=>{
  const app=createApp({config:{...config,preview:true}});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));const base='http://127.0.0.1:'+app.address().port;
  for(const path of ['/config.json','/data/bookings.sqlite','/lib/calendar.mjs','/secrets/google.json'])assert.equal((await fetch(base+path)).status,404);
  const pub=await (await fetch(base+'/api/config')).json();assert.equal(pub.teachers[0].calendarId,undefined);assert.equal(pub.teachers[0].googleEmail,undefined);
  assert.equal((await fetch(base+'/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())})).status,503);
  const live=createApp({config,service:{book(){throw new Error('must not reach');}}});await new Promise(r=>live.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>live.close(r)));assert.equal((await fetch('http://127.0.0.1:'+live.address().port+'/api/bookings',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:JSON.stringify(payload())})).status,403);
});
test('teacher OAuth callback requires matching state cookie and configured Google email',async t=>{
  const store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,9).toString('base64')});t.after(()=>store.close());let signedInEmail='other@example.test';
  const oauth={authorizationUrl:state=>`https://accounts.google.com/auth?state=${state}`,async exchange(){return {email:signedInEmail,refreshToken:'refresh-token'};}};
  const app=createApp({config,store,oauth,calendar:{clearToken(){}}});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));const base='http://127.0.0.1:'+app.address().port;
  async function connect(){
    const start=await fetch(`${base}/api/teachers/teacher-1/google/connect`,{redirect:'manual'});assert.equal(start.status,302);
    const state=new URL(start.headers.get('location')).searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0];
    return fetch(`${base}/api/google/callback?code=auth-code&state=${state}`,{headers:{Cookie:cookie}});
  }
  assert.equal((await connect()).status,403);assert.equal(store.hasGoogleToken('teacher-1'),false);
  signedInEmail='teacher@example.test';assert.equal((await connect()).status,200);assert.equal(store.googleToken('teacher-1').email,'teacher@example.test');
});
test('admin roster editor authenticates, persists updates and deactivates booking',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'kiean-admin-')),configPath=join(dir,'config.json'),adminConfig={...config,mode:'live',teachers:config.teachers.map(teacher=>({...teacher}))},store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,8).toString('base64')});
  store.saveGoogleToken('teacher-1','teacher@example.test','refresh-token');
  Object.defineProperty(adminConfig,'configFile',{value:configPath});
  const app=createApp({config:adminConfig,configPath,store,adminCredentials:{username:'center-admin',password:'private-password'}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>app.close(r));store.close();rmSync(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+app.address().port,authorization='Basic '+Buffer.from('center-admin:private-password').toString('base64');
  assert.equal((await fetch(base+'/admin')).status,401);assert.equal((await fetch(base+'/api/admin/teachers')).status,401);
  const loaded=await fetch(base+'/api/admin/teachers',{headers:{Authorization:authorization}});assert.equal(loaded.status,200);
  assert.deepEqual((await loaded.clone().json()).center,{email:null,connected:false});
  const teachers=(await loaded.json()).teachers;teachers[0].available=false;
  const changedEmail=teachers.map(teacher=>({...teacher}));changedEmail[0].googleEmail='new@example.test';
  const rejected=await fetch(base+'/api/admin/teachers',{method:'POST',headers:{Authorization:authorization,Origin:config.publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({teachers:changedEmail})});assert.equal(rejected.status,409);
  const saved=await fetch(base+'/api/admin/teachers',{method:'POST',headers:{Authorization:authorization,Origin:config.publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({teachers})});assert.equal(saved.status,200);
  for(let i=0;i<12;i++)assert.equal((await fetch(base+'/api/admin/teachers',{method:'POST',headers:{Authorization:authorization,Origin:config.publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({teachers})})).status,200);
  const persisted=JSON.parse(readFileSync(configPath,'utf8'));assert.equal(adminConfig.teachers[0].available,false);assert.equal(persisted.teachers[0].available,false);assert.equal(persisted.teachers[0].googleConnected,undefined);
  assert.throws(()=>validateBooking(payload(),adminConfig,NOW),/available teacher/);
});
test('live config allows http://localhost origin only outside production',t=>{
  const dir=mkdtempSync(join(tmpdir(),'kiean-config-')),file=join(dir,'config.json'),saved={...process.env};t.after(()=>{process.env=saved;rmSync(dir,{recursive:true,force:true});});
  const write=publicOrigin=>writeFileSync(file,JSON.stringify({mode:'live',publicOrigin,teachers:[{...PREVIEW_TEACHERS[0],id:'teacher-1',googleEmail:'teacher@example.test'}]}));
  Object.assign(process.env,{KIEAN_CONFIG:file,GOOGLE_OAUTH_CLIENT_ID:'id',GOOGLE_OAUTH_CLIENT_SECRET:'secret',KIEAN_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32).toString('base64'),NODE_ENV:'development'});
  write('http://localhost:3000');assert.equal(loadConfig().publicOrigin,'http://localhost:3000');
  write('http://kiean.example');assert.throws(()=>loadConfig(),/HTTPS/);
  process.env.NODE_ENV='production';write('http://localhost:3000');assert.throws(()=>loadConfig(),/HTTPS/);
  writeFileSync(file,'"mode": "live",\n"publicOrigin": "https://kieantutorial.com",');assert.throws(()=>loadConfig(),/not valid JSON.*starting with \{/);
});
const pdf=Buffer.from('%PDF-1.4 receipt').toString('base64'),png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]).toString('base64');
const weekdays=count=>{const out=[];for(let d='2030-06-03';out.length<count;d=addDays(d,1))if(![0,6].includes(new Date(d+'T00:00:00Z').getUTCDay()))out.push(d);return out;};
function mailHarness(t){
  const dir=mkdtempSync(join(tmpdir(),'kiean-uploads-')),store=new BookingStore(':memory:'),calendar=fakeCalendar(),sent=[];
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return {dir,sent,service:new BookingService(config,store,calendar,{uploadsDir:dir,mailer:{async send(m){sent.push(m);}}})};
}
test('session rates use package prices, with San Pedro overrides',()=>{
  const at=id=>branchById(DEFAULT_BRANCHES,id);
  assert.equal(sessionRate('online',undefined),200);assert.equal(sessionRate('academic',at('natania')),150);assert.equal(sessionRate('sped',at('pila')),300);
  assert.equal(sessionRate('academic',at('san-pedro')),250);assert.equal(sessionRate('sped',at('san-pedro')),400);assert.equal(sessionRate('after-school',at('san-pedro')),150);
});
test('online booking gets Meet links, a total and a paid teacher email with attachments',async t=>{
  const {dir,sent,service}=mailHarness(t);
  const b=await service.book({...payload(),attachments:[{kind:'request',name:'homework.png',type:'image/png',data:png},{kind:'receipt',name:'gcash.pdf',type:'application/pdf',data:pdf}]},NOW);
  assert.equal(b.total,1000);assert.equal(b.paid,true);assert(b.sessions.every(s=>s.meetLink.startsWith('https://meet.google.com/')));
  assert.deepEqual(sent.map(m=>m.to),['teacher@example.test','parent@example.test']);assert.match(sent[1].text,/meet\.google\.com/);assert.match(sent[1].subject,/^Mon, Jun 3, 2030 · Your KieAn schedule starts/);assert.equal(sent[0].to,'teacher@example.test');assert.match(sent[0].subject,/PAID/);assert.match(sent[0].text,/₱1,000/);assert.match(sent[0].text,/meet\.google\.com/);assert.equal(sent[0].attachments.length,2);
  assert.equal(readdirSync(join(dir,b.id)).length,2);
});
test('face-to-face booking emails the parent the full schedule and flags unpaid',async t=>{
  const {sent,service}=mailHarness(t);
  const b=await service.book({...payload(),program:'academic',branch:'san-pedro',area:'laguna-san-pedro',dates:weekdays(20)},NOW);
  assert.equal(b.total,5000);assert.equal(b.paid,false);assert(b.sessions.every(s=>!s.meetLink));
  assert.deepEqual(sent.map(m=>m.to),['teacher@example.test','parent@example.test']);assert.match(sent[0].subject,/UNPAID/);
  assert.equal(sent[1].text.match(/^\d+\. /gm).length,20);assert.match(sent[1].text,/San Pedro/);
});
test('a failed email does not undo a confirmed booking',async t=>{
  const {service}=mailHarness(t);service.mailer={async send(){throw new Error('Gmail down');}};
  const b=await service.book(payload(),NOW);assert.equal(b.sessions.length,5);
});
test('attachments are checked by type, signature, size and count',()=>{
  assert.throws(()=>validateAttachments([{kind:'receipt',name:'r.pdf',type:'application/pdf',data:Buffer.from('MZ fake').toString('base64')}]),/does not match/);
  assert.throws(()=>validateAttachments([{kind:'receipt',name:'r.exe',type:'application/x-msdownload',data:pdf}]),/JPG, PNG/);
  assert.throws(()=>validateAttachments([{kind:'receipt',name:'r.pdf',type:'application/pdf',data:Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(5*1024*1024)]).toString('base64')}]),/5 MB/);
  assert.throws(()=>validateAttachments(Array(4).fill({kind:'request',name:'a.png',type:'image/png',data:png})),/up to 3/);
  assert.equal(validateAttachments([{kind:'request',name:'../../etc/passwd.png',type:'image/png',data:png}])[0].name.includes('/'),false);
});
test('email MIME carries the attachment and an encoded subject',()=>{
  const raw=mime({to:'a@example.test',subject:'Bagong iskedyul ₱',text:'Hi',attachments:[{name:'r.pdf',type:'application/pdf',data:Buffer.from('%PDF-1')}]});
  assert.match(raw,/^To: a@example\.test\r\nSubject: =\?UTF-8\?B\?/);assert.match(raw,/filename="r\.pdf"/);assert.match(raw,new RegExp(Buffer.from('%PDF-1').toString('base64')));
});
test('online invite comes from the center calendar with every date, both guests and one Meet link',async t=>{
  const calls=[],store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,5).toString('base64')});t.after(()=>store.close());
  store.saveGoogleToken('__center__','kieanadmin@example.test','center-refresh');
  const c=new GoogleCalendar({store,oauth:{async refresh(token){assert.equal(token,'center-refresh');return {accessToken:'center-token',expiresIn:3600};}},fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({hangoutLink:'https://meet.google.com/x'}),{status:200});}});
  const b={...validateBooking(payload(),config,NOW),id:'123',reference:'KTC-TEST',total:1000,rate:200,paid:false};
  await c.createInvite(b);const r=JSON.parse(calls[0].options.body);
  assert.equal(calls[0].options.headers.Authorization,'Bearer center-token');assert.match(calls[0].url,/sendUpdates=all&conferenceDataVersion=1/);
  assert.deepEqual(r.attendees.map(a=>a.email),['parent@example.test','teacher@example.test']);assert.equal(r.conferenceData.createRequest.conferenceSolutionKey.type,'hangoutsMeet');
  assert.equal(r.start.dateTime,'2030-06-03T10:00:00');assert.equal(r.end.dateTime,'2030-06-03T10:50:00');assert.equal(r.start.timeZone,'Asia/Manila');
  assert.deepEqual(r.recurrence,['RDATE;TZID=Asia/Manila:20300604T100000,20300605T100000,20300606T100000,20300607T100000']);
  assert.match(r.description,/<li>/);
});
test('email subjects start with the first session day and HTML escapes parent input',()=>{
  const b={...validateBooking({...payload(),parentName:'<script>x</script>',notes:'<b>hi</b>'},config,NOW),id:'1',reference:'KTC-1',rate:200,total:1000,paid:true,sessions:payload().dates.map(date=>({date,meetLink:'https://meet.google.com/x'}))};
  const teacher=teacherEmail(b,'teacher@example.test',[]),parent=parentScheduleEmail({...b,branch:'natania'});
  assert.match(teacher.subject,/^Mon, Jun 3, 2030 · New schedule starts/);assert.match(parent.subject,/^Mon, Jun 3, 2030 · Your KieAn schedule starts/);
  assert(!teacher.html.includes('<script>'));assert(teacher.html.includes('&lt;script&gt;'));assert(teacher.html.includes('cid:kiean-logo'));assert.match(teacher.html,/Join Meet/);
  assert.match(mime(teacher),/Content-ID: <kiean-logo>/);
});
test('period types limit slots to online, face to face or SPED-only',async t=>{
  const teacher={...config.teachers[0],weekly:{1:[['09:00','12:00','online'],['13:00','14:00','f2f'],['14:00','15:00','sped'],['15:00','16:00']]}};
  const program=id=>PROGRAMS.find(p=>p.id===id);
  assert.deepEqual(slotsForDay(teacher,program('online'),'2030-06-03',NOW),['09:00','10:00','11:00','15:00']);
  assert.deepEqual(slotsForDay(teacher,program('academic'),'2030-06-03',NOW),['13:00','15:00']);
  assert.deepEqual(slotsForDay(teacher,program('sped'),'2030-06-03',NOW),['13:00','14:00','15:00']);
  // The server rejects an academic booking in a SPED-only hour.
  const cfg={...config,teachers:[{...teacher,weekly:{1:[['14:00','15:00','sped']],2:[['14:00','15:00','sped']],3:[['14:00','15:00','sped']],4:[['14:00','15:00','sped']],5:[['14:00','15:00','sped']]}}]};
  assert.throws(()=>validateBooking({...payload(),program:'academic',branch:'maliksi',area:'cavite-general-trias',time:'14:00',dates:weekdays(20)},cfg,NOW),/outside this teacher/);
  assert.equal(validateBooking({...payload(),program:'sped',branch:'maliksi',area:'cavite-general-trias',time:'14:00',dates:weekdays(20)},cfg,NOW).sessions.length,20);
});
test('roster validation accepts known period types only',()=>{
  const base={...config.teachers[0]};
  assert.doesNotThrow(()=>validateTeacherRoster([{...base,weekly:{1:[['09:00','12:00','online'],['13:00','15:00','sped']]}}]));
  assert.throws(()=>validateTeacherRoster([{...base,weekly:{1:[['09:00','12:00','vip']]}}]),/working hours/);
  assert.throws(()=>validateTeacherRoster([{...base,weekly:{1:[['09:00','12:00','playgroup',21]]}}]),/1 to 20/);
  assert.throws(()=>validateTeacherRoster([{...base,bio:'x'.repeat(351)}]),/350/);
});
test('static files get cache headers; pages and API stay uncached',async t=>{
  const app=createApp({config});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
  const base='http://127.0.0.1:'+app.address().port,cc=async path=>(await fetch(base+path)).headers.get('cache-control');
  assert.equal(await cc('/assets/kiean-logo.webp'),'public, max-age=604800');
  assert.equal(await cc('/style.css?v=1'),'public, max-age=31536000, immutable');
  assert.equal(await cc('/style.css'),'no-cache');
  assert.equal(await cc('/index.html'),'no-store');
  assert.equal(await cc('/api/config'),'no-store');
});
test('pages use clean URLs and old .html addresses redirect',async t=>{
  const app=createApp({config});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
  const base='http://127.0.0.1:'+app.address().port,get=path=>fetch(base+path,{redirect:'manual'});
  assert.equal((await get('/booking')).status,200);assert.match(await (await get('/booking')).text(),/booking-page/);
  assert.equal((await get('/')).status,200);
  const old=await get('/booking.html?mode=branch&program=sped');assert.equal(old.status,301);assert.equal(old.headers.get('location'),'/booking?mode=branch&program=sped');
  assert.equal((await get('/index.html')).headers.get('location'),'/');
  assert.equal((await get('/config.json')).status,404);
});
test('admin schedule summary groups days with the same hours',()=>{
  const weekdays={1:[['09:00','12:00','online'],['13:00','17:00']],2:[['09:00','12:00','online'],['13:00','17:00']],3:[['09:00','12:00','online'],['13:00','17:00']],4:[['09:00','12:00','online'],['13:00','17:00']],5:[['09:00','12:00','online'],['13:00','17:00']]};
  assert.deepEqual(scheduleSummary(weekdays),{lines:['Mon–Fri · 9 AM–12 PM Online, 1 PM–5 PM'],hours:35});
  const pattern={1:[['09:00','10:00','sped']],3:[['09:00','10:00','sped']],5:[['09:00','10:00','sped']],2:[['14:00','15:00','f2f']],4:[['14:00','15:00','f2f']]};
  assert.deepEqual(scheduleSummary(pattern).lines,['Mon, Wed, Fri · 9 AM–10 AM SPED','Tue, Thu · 2 PM–3 PM F2F']);
  assert.deepEqual(scheduleSummary({}),{lines:[],hours:0});
});
test('branch bookings must match the parent area and the branch programs (PDF geo-fence)',()=>{
  const base={...payload(),program:'academic',branch:'pila',dates:weekdays(20)};
  assert.equal(validateBooking({...base,area:'laguna-pila'},config,NOW).area,'Pila');
  assert.throws(()=>validateBooking({...base,area:'cavite-imus'},config,NOW),/does not serve your area/);
  assert.throws(()=>validateBooking({...base,area:undefined},config,NOW),/does not serve your area/);
  assert.throws(()=>validateBooking({...base,program:'kiddie-care',area:'laguna-pila',hours:4},config,NOW),/does not offer/);
  assert.equal(validateBooking({...payload(),area:'cavite-imus'},config,NOW).branch,'online');
  assert.deepEqual(areaBranches(DEFAULT_BRANCHES,'cavite-naic'),['san-francisco']);
});
function classHarness(t,weekly){
  const teacher={...config.teachers[0],programs:PROGRAMS.map(p=>p.id),branches:['online','natania','south-square','pila'],weekly};
  const cfg={...config,teachers:[teacher]},store=new BookingStore(':memory:');t.after(()=>store.close());
  return {cfg,service:new BookingService(cfg,store,fakeCalendar())};
}
const classBooking=extra=>({...payload(),requestId:randomUUID(),program:'playgroup',branch:'natania',area:'cavite-general-trias',dates:weekdays(20),time:'09:00',...extra});
test('group classes share a period up to its class size, and tutoring cannot use it',async t=>{
  const week=d=>Object.fromEntries([1,2,3,4,5].map(n=>[n,d]));
  const {cfg,service}=classHarness(t,week([['09:00','10:00','playgroup',2],['10:00','12:00','f2f']]));
  await service.book(classBooking(),NOW);await service.book(classBooking({studentName:'Second'}),NOW);
  await assert.rejects(service.book(classBooking({studentName:'Third'}),NOW),e=>e.status===409);
  assert.throws(()=>validateBooking({...classBooking(),program:'academic',time:'09:00'},cfg,NOW),/outside this teacher/);
  const open=await service.availability({teacher:'teacher-1',program:'playgroup',branch:'natania',month:'2030-06',dates:''},NOW);
  assert.deepEqual(open.dates['2030-06-03'],[]);
});
test('Kiddie Care prices day, night, walk-in and monthly stays from the rate card',async t=>{
  const week=Object.fromEntries([1,2,3,4,5].map(n=>[n,[['07:00','19:00','kiddie-care',10],['19:00','07:00','kiddie-night',4]]]));
  const teacher={...config.teachers[0],programs:['kiddie-care'],branches:['south-square'],weekly:week};
  const cfg={...config,teachers:[teacher]},base={...payload(),program:'kiddie-care',branch:'south-square',area:'cavite-imus',dates:['2030-06-03','2030-06-04'],time:'08:00',needs:'regular'};
  const day=validateBooking({...base,care:'day',hours:4},cfg,NOW);
  assert.equal(day.slotMinutes,240);assert.equal(day.sessions[0].end,'2030-06-03T04:00:00.000Z');assert.equal(day.total,460);assert.equal(day.sessions[0].seats,10);
  assert.equal(validateBooking({...base,care:'day',hours:6,needs:'special',tutorial:true},cfg,NOW).total,1700);
  assert.equal(validateBooking({...base,care:'walk-in-day',hours:3},cfg,NOW).total,600);
  const night=validateBooking({...base,care:'night',hours:8,time:'22:00'},cfg,NOW);
  assert.equal(night.total,1100);assert.equal(night.sessions[0].end,'2030-06-03T22:00:00.000Z');assert.equal(night.sessions[0].seats,4);
  assert.equal(validateBooking({...base,care:'day',hours:8,plan:'monthly',dates:weekdays(20)},cfg,NOW).total,9000);
  assert.throws(()=>validateBooking({...base,care:'day',hours:4,plan:'monthly'},cfg,NOW),/20/);
  assert.throws(()=>validateBooking({...base,care:'night',hours:4,needs:'special',plan:'monthly',dates:weekdays(20),time:'19:00'},cfg,NOW),/no monthly/);
  assert.throws(()=>validateBooking({...base,care:'day',hours:3},cfg,NOW),/4, 6, 8 hours/);
  assert.throws(()=>validateBooking({...base,care:'day',hours:8,time:'12:00'},cfg,NOW),/outside this teacher/);
  assert.throws(()=>validateBooking({...base,care:'night',hours:4,time:'08:00'},cfg,NOW),/outside this teacher/);
  const store=new BookingStore(':memory:');t.after(()=>store.close());
  const open=await new BookingService(cfg,store,fakeCalendar()).availability({teacher:'teacher-1',program:'kiddie-care',branch:'south-square',month:'2030-06',dates:'',care:'night',hours:'12'},NOW);
  assert.deepEqual(open.dates['2030-06-03'],['19:00']);
  assert.throws(()=>validateTeacherRoster([{...teacher,weekly:{1:[['19:00','07:00','kiddie-care',4]]}}]),/working hours/);
});
test('Nursery enrollment is exactly 20 class days at the monthly fee',()=>{
  const teacher={...config.teachers[0],programs:['nursery'],branches:['naic'],weekly:Object.fromEntries([1,2,3,4,5].map(n=>[n,[['09:00','10:30','nursery',5]]]))};
  const cfg={...config,teachers:[teacher]},base={...payload(),program:'nursery',branch:'naic',area:'cavite-silang',time:'09:00'};
  const b=validateBooking({...base,dates:weekdays(20)},cfg,NOW);assert.equal(b.total,2500);assert.equal(b.slotMinutes,90);
  assert.throws(()=>validateBooking({...base,dates:weekdays(21)},cfg,NOW),/Choose 20 class dates/);
});
test('group class events are transparent so they do not block the teacher in Google',async t=>{
  const calls=[],store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,5).toString('base64')});t.after(()=>store.close());store.saveGoogleToken('teacher-1','teacher@example.test','r');
  const c=new GoogleCalendar({store,oauth:{async refresh(){return {accessToken:'a',expiresIn:3600};}},fetcher:async(url,options)=>{calls.push(JSON.parse(options.body));return new Response('{}',{status:200});}});
  const base={...validateBooking(payload(),config,NOW),id:'1',reference:'KTC-1',total:1000};
  await c.create(base,base.sessions[0]);await c.create({...base,programId:'playgroup'},base.sessions[1]);
  assert.equal(calls[0].transparency,'opaque');assert.equal(calls[1].transparency,'transparent');
});
test('roster requires a class size only on class periods',()=>{
  const base={...config.teachers[0]};
  assert.doesNotThrow(()=>validateTeacherRoster([{...base,weekly:{1:[['09:00','10:30','nursery',5]]}}]));
  assert.throws(()=>validateTeacherRoster([{...base,weekly:{1:[['09:00','10:30','nursery']]}}]),/class size/);
  assert.throws(()=>validateTeacherRoster([{...base,weekly:{1:[['09:00','12:00','f2f',3]]}}]),/class size/);
});
test('browser location maps to the right geo-fence area',()=>{
  assert.equal(matchArea({town:'Pila',province:'Laguna',region:'Calabarzon'})?.id,'laguna-pila');
  assert.equal(matchArea({city:'General Trias',province:'Cavite'})?.id,'cavite-general-trias');
  assert.equal(matchArea({city:'Rosario',province:'Batangas'})?.id,'batangas-rosario');
  assert.equal(matchArea({city:'Rosario',province:'Cavite'})?.id,'cavite-rosario');
  assert.equal(matchArea({city:'Quezon City',state:'Metro Manila'})?.id,'metro-manila-quezon-city');
  assert.equal(matchArea({city:'Biñan',province:'Laguna'})?.id,'laguna-binan');
  assert.equal(matchArea({town:'Iba',province:'Zambales'})?.id,'other-luzon-zambales');
  assert.equal(matchArea({town:'Quezon',province:'Quezon'})?.id,'other-luzon-quezon-province');
  assert.equal(matchArea({town:'Malolos',province:'Bulacan'}),null);
  assert.equal(matchArea({}),null);
});
test('online teachers follow the same geo-fence through their own branches',()=>{
  const teacher={...config.teachers[0],branches:['online','san-pedro']},cfg={...config,teachers:[teacher]};
  assert.equal(validateBooking({...payload(),area:'laguna-binan'},cfg,NOW).area,'Biñan');
  assert.throws(()=>validateBooking({...payload(),area:'cavite-imus'},cfg,NOW),/online teacher does not serve your area/);
  assert.throws(()=>validateBooking({...payload(),area:undefined},cfg,NOW),/online teacher does not serve your area/);
  assert.throws(()=>validateBooking(payload(),{...config,teachers:[{...teacher,branches:['online']}]},NOW),/online teacher does not serve your area/);
});
test('admin signs in on a page, gets a secure session cookie, and signs out',async t=>{
  const store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,9).toString('base64')});
  const app=createApp({config:{...config,mode:'live'},store,adminCredentials:{username:'center-admin',password:'private-password'}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>app.close(r));store.close();});
  const base='http://127.0.0.1:'+app.address().port,origin=config.publicOrigin;
  const login=(username,password,from=origin)=>fetch(base+'/api/admin/login',{method:'POST',redirect:'manual',headers:{Origin:from,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password})});
  const page=await fetch(base+'/admin');assert.equal(page.status,401);assert.equal(page.headers.get('www-authenticate'),null);assert.match(await page.text(),/<h1 id="login-title">Sign in<\/h1>/);
  const wrong=await login('center-admin','nope');assert.equal(wrong.status,303);assert.equal(wrong.headers.get('location'),'/admin?error=1');assert.equal(wrong.headers.get('set-cookie'),null);
  assert.match(await (await fetch(base+'/admin?error=1')).text(),/not right/);
  assert.equal((await login('center-admin','private-password','https://attacker.example')).status,403);
  const ok=await login('center-admin','private-password');assert.equal(ok.status,303);assert.equal(ok.headers.get('location'),'/admin');
  const cookie=ok.headers.get('set-cookie');assert.match(cookie,/kiean_admin=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Secure; Max-Age=28800/);
  const session=cookie.split(';')[0];
  assert.equal((await fetch(base+'/admin',{headers:{Cookie:session}})).status,200);
  assert.equal((await fetch(base+'/api/admin/teachers',{headers:{Cookie:session}})).status,200);
  assert.equal((await fetch(base+'/api/admin/teachers',{headers:{Cookie:'kiean_admin='+'x'.repeat(43)}})).status,401);
  const out=await fetch(base+'/api/admin/logout',{method:'POST',redirect:'manual',headers:{Origin:origin,Cookie:session}});
  assert.equal(out.headers.get('location'),'/admin?signedout=1');assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await fetch(base+'/api/admin/teachers',{headers:{Cookie:session}})).status,401);
});
test('admin manages locations: add, photos, in-use protection, and booking picks them up',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'kiean-branches-')),configPath=join(dir,'config.json'),photosDir=join(dir,'photos');
  const cfg={...config,mode:'live',branches:structuredClone(DEFAULT_BRANCHES),teachers:[{...config.teachers[0],branches:['online','pila']}]};
  Object.defineProperty(cfg,'configFile',{value:configPath});
  const store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,4).toString('base64')});
  const app=createApp({config:cfg,configPath,store,photosDir,adminCredentials:{username:'center-admin',password:'private-password'}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>app.close(r));store.close();rmSync(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+app.address().port,auth={Authorization:'Basic '+Buffer.from('center-admin:private-password').toString('base64'),Origin:cfg.publicOrigin,'Content-Type':'application/json'};
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:auth,body:JSON.stringify(body)});
  // photo upload: real PNG accepted and served; a PDF is refused
  const up=await post('/api/admin/branch-photos',{type:'image/png',data:Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,7]).toString('base64')});assert.equal(up.status,200);
  const {path}=await up.json();assert.match(path,/^branch-photos\/[a-f0-9]{24}\.png$/);
  const served=await fetch(base+'/'+path);assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'image/png');
  assert.equal((await post('/api/admin/branch-photos',{type:'application/pdf',data:Buffer.from('%PDF-1').toString('base64')})).status,400);
  // add a new location serving Imus with Playgroup
  const fresh={id:'dasma',name:'Dasmariñas',address:'Somewhere, Dasmariñas, Cavite',available:true,programs:['academic','playgroup'],areas:['cavite-imus','cavite-dasmarinas'],photos:[path]};
  const saved=await post('/api/admin/branches',{branches:[...cfg.branches,fresh]});assert.equal(saved.status,200);
  assert.equal(JSON.parse(readFileSync(configPath,'utf8')).branches.at(-1).id,'dasma');
  assert.deepEqual(areaBranches(cfg.branches,'cavite-dasmarinas'),['natania','south-square','maliksi','dasma']);
  const pub=await (await fetch(base+'/api/config')).json();assert.equal(pub.branches.at(-1).address,'Somewhere, Dasmariñas, Cavite');
  // teachers can now use the new location; bookings there pass the geo-fence
  assert.doesNotThrow(()=>validateTeacherRoster([{...config.teachers[0],branches:['online','dasma']}],cfg.branches));
  const teacherAtDasma={...cfg,teachers:[{...config.teachers[0],branches:['online','dasma']}]};
  assert.equal(validateBooking({...payload(),program:'academic',branch:'dasma',area:'cavite-imus',dates:weekdays(20)},teacherAtDasma,NOW).branchName,'Dasmariñas');
  // a location a teacher still uses cannot be deleted; bad data is refused
  assert.match((await (await post('/api/admin/branches',{branches:cfg.branches.filter(b=>b.id!=='pila')})).json()).error,/still accepting bookings/);
  assert.equal((await post('/api/admin/branches',{branches:cfg.branches.map(b=>b.id==='pila'?{...b,available:false}:b)})).status,200);
  const res=await post('/api/admin/branches',{branches:cfg.branches.filter(b=>b.id!=='pila'),remove:{id:'pila',name:'Pila, Laguna'}});assert.equal(res.status,409);assert.match((await res.json()).error,/Pila, Laguna still has teachers/);
  assert.equal((await post('/api/admin/branches',{branches:[{...fresh,areas:['mars']}]})).status,400);
  assert.equal((await post('/api/admin/branches',{branches:[{...fresh,photos:['../config.json']}]})).status,400);
  assert.equal((await fetch(base+'/api/admin/branches',{method:'POST',headers:{...auth,Origin:'https://attacker.example'},body:'{}'})).status,403);
});

test('admin manages programs: prices, Kiddie Care rates, new classes, and booking uses them',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'kiean-programs-')),configPath=join(dir,'config.json');
  const cfg={...config,mode:'live',programs:structuredClone(DEFAULT_PROGRAMS),branches:structuredClone(DEFAULT_BRANCHES),teachers:[{...config.teachers[0],branches:['online','pila']}]};
  Object.defineProperty(cfg,'configFile',{value:configPath});
  const store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,4).toString('base64')});
  const app=createApp({config:cfg,configPath,store,adminCredentials:{username:'center-admin',password:'private-password'}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>app.close(r));store.close();rmSync(dir,{recursive:true,force:true});setPrograms(DEFAULT_PROGRAMS);});
  const base='http://127.0.0.1:'+app.address().port,auth={Authorization:'Basic '+Buffer.from('center-admin:private-password').toString('base64'),Origin:cfg.publicOrigin,'Content-Type':'application/json'};
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:auth,body:JSON.stringify(body)});
  const edit=(id,change)=>cfg.programs.map(p=>p.id===id?{...p,...change}:p);
  // new academic price, new day-stay rate, a new group class and an info card
  const club={id:'reading-club',name:'Reading Club',mode:'branch',group:true,minSessions:8,maxSessions:8,rate:180,lessonMinutes:60,slotMinutes:60,price:'₱1,440 / 8 sessions',note:'Ages 5–8',icon:'📕',details:['Saturdays']};
  const care=cfg.programs.find(p=>p.care),rates=structuredClone(care.careRates);rates.day.rates.regular[4]=250;
  let next=edit('academic',{rate:175}).map(p=>p.care?{...p,careRates:rates}:p);next=[...next,club,{id:'camp',name:'Holiday Camp',link:'reading-club',price:'Ask us'}];
  const saved=await post('/api/admin/programs',{programs:next});assert.equal(saved.status,200,await saved.clone().text());
  assert.deepEqual(JSON.parse(readFileSync(configPath,'utf8')).programs.slice(-2).map(p=>p.id),['reading-club','camp']);
  assert.equal((await (await fetch(base+'/api/config')).json()).programs.find(p=>p.id==='camp').link,'reading-club');
  assert.equal(kiddieQuote({care:'day',needs:'regular',hours:4,days:2}).total,500);
  assert(PERIOD_TYPES.some(p=>p.id==='reading-club'&&p.group));
  assert.equal(validateBooking({...payload(),program:'academic',branch:'pila',dates:weekdays(20)},cfg,NOW).total,175*20);
  // a branch and teacher offering the new class can take a fixed 8-day enrollment
  assert.equal((await post('/api/admin/branches',{branches:cfg.branches.map(b=>b.id==='pila'?{...b,programs:[...b.programs,'reading-club']}:b)})).status,200);
  const weekly=Object.fromEntries([1,2,3,4,5].map(d=>[d,[['09:00','12:00','reading-club',6]]]));
  const withClub={...cfg,teachers:[{...cfg.teachers[0],programs:['reading-club'],weekly}]};
  const b=validateBooking({...payload(),program:'reading-club',branch:'pila',dates:weekdays(8)},withClub,NOW);assert.equal(b.total,1440);assert.equal(b.programName,'Reading Club');
  assert.throws(()=>validateBooking({...payload(),program:'reading-club',branch:'pila',dates:weekdays(9)},withClub,NOW),/Choose 8 class dates/);
  // paused programs cannot be booked; info cards never can
  assert.equal((await post('/api/admin/programs',{programs:cfg.programs.map(p=>p.id==='reading-club'?{...p,available:false}:p)})).status,200);
  assert.throws(()=>validateBooking({...payload(),program:'reading-club',branch:'pila',dates:weekdays(8)},withClub,NOW),/available teacher and program/);
  assert.throws(()=>validateBooking({...payload(),program:'camp',branch:'pila',dates:weekdays(8)},withClub,NOW),/available teacher and program/);
  // in use, type changes, built-ins and bad links are refused
  const inUse=await post('/api/admin/programs',{programs:cfg.programs.filter(p=>p.id!=='reading-club').map(p=>p.id==='camp'?{...p,link:''}:p),remove:{id:'reading-club',name:'Reading Club'}});assert.equal(inUse.status,409);assert.match((await inUse.json()).error,/Reading Club is still offered/);
  assert.equal((await post('/api/admin/programs',{programs:edit('academic',{group:true})})).status,400);
  assert.equal((await post('/api/admin/programs',{programs:cfg.programs.filter(p=>p.id!=='online')})).status,400);
  assert.equal((await post('/api/admin/programs',{programs:edit('camp',{link:'nowhere'})})).status,400);
  assert.equal((await post('/api/admin/programs',{programs:edit('academic',{slotMinutes:50})})).status,400);
  assert.equal((await fetch(base+'/api/admin/programs',{method:'POST',headers:{...auth,Origin:'https://attacker.example'},body:'{}'})).status,403);
  assert.equal(kiddieQuote({care:'day',needs:'regular',hours:4,days:1}).total,250,'refused saves leave the live list alone');
});
test('program validation keeps the default list intact and rejects bad Kiddie Care prices',()=>{
  assert.equal(validatePrograms(structuredClone(DEFAULT_PROGRAMS)).length,DEFAULT_PROGRAMS.length);
  const bad=structuredClone(DEFAULT_PROGRAMS);bad.find(p=>p.care).careRates.day.rates.regular[4]=-5;
  assert.throws(()=>validatePrograms(bad),/whole pesos/);
  const none=structuredClone(DEFAULT_PROGRAMS);none.find(p=>p.care).careRates={};
  assert.throws(()=>validatePrograms(none),/at least one care price/);
});

test('portfolio teachers (pp. 28–34) form a valid roster with no FULL SLOT or lunch hours',()=>{
  const roster=validateTeacherRoster(structuredClone(PORTFOLIO_TEACHERS),DEFAULT_BRANCHES);
  assert.equal(roster.length,17);assert(roster.every(t=>t.available===false&&t.googleEmail.endsWith('@example.com')));
  assert(roster.every(t=>Object.values(t.weekly).flat().every(([start])=>start!=='12:00')),'lunch stays out');
  const sp=roster.find(t=>t.id==='san-pedro-t1');assert.deepEqual(sp.weekly[1][0],['09:00','10:00','playgroup',3]);assert.deepEqual(sp.weekly[2][0],['09:00','11:00','sped']);
});

test('deleting needs a disabled item, one at a time, with its exact name; teachers with upcoming sessions stay',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'kiean-delete-')),configPath=join(dir,'config.json');
  const extra={...config.teachers[0],id:'teacher-2',name:'Second Teacher',googleEmail:'second@example.test',branches:['online','pila']};
  const cfg={...config,mode:'live',programs:structuredClone(DEFAULT_PROGRAMS),branches:structuredClone(DEFAULT_BRANCHES),teachers:[{...config.teachers[0],branches:['online','pila']},extra]};
  Object.defineProperty(cfg,'configFile',{value:configPath});
  const store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,4).toString('base64')});
  const app=createApp({config:cfg,configPath,store,adminCredentials:{username:'center-admin',password:'private-password'}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>app.close(r));store.close();rmSync(dir,{recursive:true,force:true});setPrograms(DEFAULT_PROGRAMS);});
  const base='http://127.0.0.1:'+app.address().port,auth={Authorization:'Basic '+Buffer.from('center-admin:private-password').toString('base64'),Origin:cfg.publicOrigin,'Content-Type':'application/json'};
  const post=async(path,body)=>{const r=await fetch(base+path,{method:'POST',headers:auth,body:JSON.stringify(body)});return {status:r.status,error:(await r.json()).error};};
  const strip=list=>list.map(({googleConnected,...x})=>x);
  // programs: summer is an info card nobody uses
  const off=cfg.programs.map(p=>p.id==='summer'?{...p,available:false}:p),without=off.filter(p=>p.id!=='summer');
  assert.match((await post('/api/admin/programs',{programs:cfg.programs.filter(p=>p.id!=='summer'),remove:{id:'summer',name:'Summer Class'}})).error,/still accepting bookings/);
  assert.equal((await post('/api/admin/programs',{programs:off})).status,200);
  assert.match((await post('/api/admin/programs',{programs:without})).error,/type its exact name/);
  assert.match((await post('/api/admin/programs',{programs:without,remove:{id:'summer',name:'summer class'}})).error,/type its exact name/);
  assert.match((await post('/api/admin/programs',{programs:without.filter(p=>p.id!=='field-trip'),remove:{id:'summer',name:'Summer Class'}})).error,/one program at a time/);
  assert.equal((await post('/api/admin/programs',{programs:without,remove:{id:'summer',name:'Summer Class'}})).status,200);
  assert(!cfg.programs.some(p=>p.id==='summer'));
  // locations: naic has no teacher here
  const naic=cfg.branches.find(b=>b.id==='naic');
  assert.equal((await post('/api/admin/branches',{branches:cfg.branches.map(b=>b.id==='naic'?{...b,available:false}:b)})).status,200);
  assert.match((await post('/api/admin/branches',{branches:cfg.branches.filter(b=>b.id!=='naic'),remove:{id:'naic',name:'Wrong'}})).error,/type its exact name/);
  assert.equal((await post('/api/admin/branches',{branches:cfg.branches.filter(b=>b.id!=='naic'),remove:{id:'naic',name:naic.name}})).status,200);
  // teachers: enabled refused; disabled with an upcoming session refused; afterwards deleted with its Google token
  store.saveGoogleToken('teacher-2','second@example.test','refresh');
  assert.match((await post('/api/admin/teachers',{teachers:strip([cfg.teachers[0]]),remove:{id:'teacher-2',name:'Second Teacher'}})).error,/still accepting bookings/);
  assert.equal((await post('/api/admin/teachers',{teachers:strip(cfg.teachers.map(x=>x.id==='teacher-2'?{...x,available:false}:x))})).status,200);
  const start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.now()+90000000).toISOString();
  store.db.prepare("INSERT INTO bookings(id,request_key,digest,status,payload,created_at) VALUES('b1','k1','d','confirmed','{}',?)").run(start);
  store.db.prepare("INSERT INTO sessions(booking_id,teacher_id,start,end) VALUES('b1','teacher-2',?,?)").run(start,end);
  assert.match((await post('/api/admin/teachers',{teachers:strip([cfg.teachers[0]]),remove:{id:'teacher-2',name:'Second Teacher'}})).error,/upcoming sessions/);
  store.db.prepare("UPDATE bookings SET status='cancelled'").run();
  assert.equal((await post('/api/admin/teachers',{teachers:strip([cfg.teachers[0]]),remove:{id:'teacher-2',name:'Second Teacher'}})).status,200);
  assert.equal(cfg.teachers.length,1);assert.equal(store.hasGoogleToken('teacher-2'),false);
});
test('signed-in admins are not rate limited on any settings screen; anonymous writes still are',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'kiean-rate-')),configPath=join(dir,'config.json');
  const cfg={...config,mode:'live',programs:structuredClone(DEFAULT_PROGRAMS),branches:structuredClone(DEFAULT_BRANCHES),teachers:[{...config.teachers[0]}]};
  Object.defineProperty(cfg,'configFile',{value:configPath});
  const store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,4).toString('base64')});
  const app=createApp({config:cfg,configPath,store,adminCredentials:{username:'center-admin',password:'private-password'}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>app.close(r));store.close();rmSync(dir,{recursive:true,force:true});setPrograms(DEFAULT_PROGRAMS);});
  const base='http://127.0.0.1:'+app.address().port,auth={Authorization:'Basic '+Buffer.from('center-admin:private-password').toString('base64'),Origin:cfg.publicOrigin,'Content-Type':'application/json'};
  for(let i=0;i<15;i++){const order=i%2?[...cfg.programs].reverse():cfg.programs;assert.equal((await fetch(base+'/api/admin/programs',{method:'POST',headers:auth,body:JSON.stringify({programs:order})})).status,200,`save ${i+1}`);}
  let last;for(let i=0;i<12;i++)last=await fetch(base+'/api/bookings',{method:'POST',headers:{Origin:cfg.publicOrigin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(last.status,429);
});
test('admin edits the Permits and Feedback photos; only bundled or uploaded images are accepted',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'kiean-gallery-')),configPath=join(dir,'config.json'),photosDir=join(dir,'photos');
  const cfg={...config,mode:'live',programs:structuredClone(DEFAULT_PROGRAMS),branches:structuredClone(DEFAULT_BRANCHES),teachers:[{...config.teachers[0]}]};
  Object.defineProperty(cfg,'configFile',{value:configPath});
  const store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,4).toString('base64')});
  const app=createApp({config:cfg,configPath,store,photosDir,adminCredentials:{username:'center-admin',password:'private-password'}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>app.close(r));store.close();rmSync(dir,{recursive:true,force:true});setPrograms(DEFAULT_PROGRAMS);});
  const base='http://127.0.0.1:'+app.address().port,auth={Authorization:'Basic '+Buffer.from('center-admin:private-password').toString('base64'),Origin:cfg.publicOrigin,'Content-Type':'application/json'};
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:auth,body:JSON.stringify(body)});
  assert.equal((await (await fetch(base+'/api/config')).json()).galleries.permits.length,5);
  const up=await post('/api/admin/branch-photos',{type:'image/png',data:Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,7]).toString('base64')});const {path}=await up.json();
  const galleries={testimonials:[...DEFAULT_GALLERIES.testimonials.slice(1),{src:path,alt:'New feedback'}],permits:[{src:path,caption:'Fire safety permit',alt:'Fire safety inspection certificate'},...DEFAULT_GALLERIES.permits]};
  assert.equal((await post('/api/admin/galleries',{galleries})).status,200);
  const pub=(await (await fetch(base+'/api/config')).json()).galleries;
  assert.equal(pub.permits[0].caption,'Fire safety permit');assert.equal(pub.testimonials.at(-1).src,path);assert.equal(pub.testimonials.length,4);
  assert.equal(JSON.parse(readFileSync(configPath,'utf8')).galleries.permits.length,6);
  for(const src of ['../config.json','https://evil.example/x.png','assets/kiean-logo.webp','branch-photos/../../x.png'])assert.equal((await post('/api/admin/galleries',{galleries:{...galleries,permits:[{src,caption:'x'}]}})).status,400,src);
  assert.equal((await post('/api/admin/galleries',{galleries:{...galleries,permits:[{src:path,caption:'x'.repeat(121)}]}})).status,400);
  assert.equal((await fetch(base+'/api/admin/galleries',{method:'POST',headers:{'Content-Type':'application/json',Origin:cfg.publicOrigin},body:JSON.stringify({galleries})})).status,401);
});
test('SEO and policy pages: clean URLs, robots, sitemap, canonical tags and a friendly 404',async t=>{
  const app=createApp({config:{...config,preview:true}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>app.close(r)));
  const base='http://127.0.0.1:'+app.address().port;
  for(const slug of ['faq','payment','contact','privacy-policy','terms','refund-policy','cookie-policy','consent-form','booking','']){
    const r=await fetch(base+'/'+slug);assert.equal(r.status,200,slug);const html=await r.text();
    assert.match(html,new RegExp(`<link rel="canonical" href="https://kieantutorial.com/${slug}"`),slug);
    assert.match(html,/<meta (name="description" content="[^"]{50,}"|content="[^"]{50,}" name="description")/,slug);
    assert.match(html,/og:image/,slug);
  }
  const old=await fetch(base+'/privacy-policy.html',{redirect:'manual'});assert.equal(old.status,301);assert.equal(old.headers.get('location'),'/privacy-policy');
  const robots=await (await fetch(base+'/robots.txt')).text();assert.match(robots,/Disallow: \/admin/);assert.match(robots,/Sitemap: https:\/\/kieantutorial.com\/sitemap.xml/);
  const sitemap=await fetch(base+'/sitemap.xml');assert.match(sitemap.headers.get('content-type'),/xml/);assert.equal(((await sitemap.text()).match(/<loc>/g)||[]).length,10);
  const missing=await fetch(base+'/no-such-page');assert.equal(missing.status,404);assert.match(missing.headers.get('content-type'),/html/);const page=await missing.text();assert.match(page,/noindex/);assert.match(page,/We can’t find that page/);
  const api=await fetch(base+'/api/nothing');assert.equal(api.status,404);assert.match(api.headers.get('content-type'),/json/);
  assert.equal((await fetch(base+'/assets/og-image.png')).status,200);
  const faq=await (await fetch(base+'/faq')).text();assert.match(faq,/"@type":"FAQPage"/);
  for(const slug of ['','booking','faq'])assert.doesNotMatch(await (await fetch(base+'/'+slug)).text(),/<img(?![^>]*\balt=)[^>]*>/,'every image has alt text');
});

test('unpaid parent emails link to the GCash payment page; paid ones do not',()=>{
  const booking={...validateBooking(payload(),config,NOW),id:'b1',reference:'KTC-TEST0001',paid:false,meetLink:'https://meet.google.com/abc-defg-hij'};
  const unpaid=parentScheduleEmail(booking);
  assert.match(unpaid.html,new RegExp(`href="${PAYMENT_URL}"`));assert.match(unpaid.html,/Pay by GCash, then reply to this email with your receipt/);
  assert.match(unpaid.text,new RegExp(`How to pay: ${PAYMENT_URL}`));
  const paid=parentScheduleEmail({...booking,paid:true});
  assert.doesNotMatch(paid.html,/kieantutorial.com\/payment/);assert.doesNotMatch(paid.text,/How to pay/);
  assert.doesNotMatch(teacherEmail(booking,'teacher@example.test',[]).html,/kieantutorial.com\/payment/,'teachers do not get the payment link');
});
test('fonts are self-hosted: no Google Fonts requests, woff2 served, CSP allows only our own fonts',async t=>{
  const app=createApp({config:{...config,preview:true}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>app.close(r)));
  const base='http://127.0.0.1:'+app.address().port;
  for(const f of ['dm-sans-latin','dm-sans-latin-ext','nunito-latin','nunito-latin-ext']){const r=await fetch(`${base}/assets/fonts/${f}.woff2`);assert.equal(r.status,200,f);assert.equal(r.headers.get('content-type'),'font/woff2');}
  const home=await fetch(base+'/');assert.doesNotMatch(home.headers.get('content-security-policy'),/googleapis|gstatic/);
  for(const p of ['/','/booking','/faq','/payment','/terms'])assert.doesNotMatch(await (await fetch(base+p)).text(),/fonts\.(googleapis|gstatic)\.com/,p);
  assert.match(await (await fetch(base+'/style.css')).text(),/@font-face \{ font-family: 'DM Sans'/);
  assert.equal((await fetch(base+'/assets/fonts/../../server.mjs')).status,404);
});

test('visitor address: CF-Connecting-IP is trusted only from Cloudflare, never from a direct request',()=>{
  const req=(remote,headers={})=>({socket:{remoteAddress:remote},headers});
  // Caddy (172.17.0.1) forwards a request it received from a Cloudflare edge server.
  assert.equal(clientIp(req('172.17.0.1',{'x-forwarded-for':'162.158.10.20','cf-connecting-ip':'112.198.1.2'}),'cloudflare'),'112.198.1.2');
  assert.equal(clientIp(req('172.17.0.1',{'x-forwarded-for':'2606:4700:10::6816:1','cf-connecting-ip':'112.198.1.2'}),'cloudflare'),'112.198.1.2');
  // Someone bypassing Cloudflare fakes the header: their real address is used instead.
  assert.equal(clientIp(req('172.17.0.1',{'x-forwarded-for':'45.9.8.7','cf-connecting-ip':'1.1.1.1'}),'cloudflare'),'45.9.8.7');
  assert.equal(clientIp(req('::ffff:45.9.8.7',{'cf-connecting-ip':'1.1.1.1'}),'cloudflare'),'45.9.8.7');
  assert.equal(clientIp(req('10.0.0.5',{'x-forwarded-for':'9.9.9.9, 45.9.8.7'}),'1'),'45.9.8.7');
  assert.equal(clientIp(req('10.0.0.5',{'x-forwarded-for':'45.9.8.7'}),undefined),'10.0.0.5','headers ignored unless a proxy is configured');
});
test('admin sign-in: 10 wrong passwords lock that address out, by form or Authorization header; security headers are set',async t=>{
  const cfg={...config,mode:'live',programs:structuredClone(DEFAULT_PROGRAMS),branches:structuredClone(DEFAULT_BRANCHES),teachers:[{...config.teachers[0]}]};
  const store=new BookingStore(':memory:',{tokenEncryptionKey:Buffer.alloc(32,4).toString('base64')});
  const app=createApp({config:cfg,store,adminCredentials:{username:'center-admin',password:'private-password'}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>app.close(r));store.close();setPrograms(DEFAULT_PROGRAMS);});
  const base='http://127.0.0.1:'+app.address().port,basic=pw=>({Authorization:'Basic '+Buffer.from('center-admin:'+pw).toString('base64')});
  const login=pw=>fetch(base+'/api/admin/login',{method:'POST',redirect:'manual',headers:{Origin:cfg.publicOrigin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'center-admin',password:pw})});
  const head=await fetch(base+'/');
  assert.match(head.headers.get('strict-transport-security'),/max-age=31536000/);assert.equal(head.headers.get('x-frame-options'),'DENY');
  assert.match(head.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(head.headers.get('permissions-policy'),/camera=\(\)/);
  assert.equal(head.headers.get('cross-origin-opener-policy'),'same-origin');
  // a right password still works before the limit
  assert.equal((await login('private-password')).headers.get('location'),'/admin');
  for(let i=0;i<5;i++)assert.equal((await login('guess'+i)).headers.get('location'),'/admin?error=1');
  for(let i=0;i<5;i++)assert.equal((await fetch(base+'/api/admin/teachers',{headers:basic('guess'+i)})).status,401);
  // 10 failures across both doors: now locked, even with the right password
  assert.equal((await login('private-password')).status,429);
  assert.equal((await fetch(base+'/api/admin/teachers',{headers:basic('private-password')})).status,429);
  assert.equal((await fetch(base+'/admin',{headers:basic('private-password')})).status,429);
  assert.equal((await fetch(base+'/')).status,200,'the public site is unaffected');
  assert.equal((await fetch(base+'/%E0%A4%A')).status,404,'a malformed address gets the 404 page, not a server error');
});

test('a leftover template placeholder for payment instructions never reaches parents',()=>{
  assert.equal(publicConfig({...config,paymentInstructions:'REPLACE with GCash / bank details, e.g. GCash: 09XX XXX XXXX'}).paymentInstructions,'');
  assert.equal(publicConfig({...config,paymentInstructions:'GCash 0917 000 0000 · KieAn Tutorial Center'}).paymentInstructions,'GCash 0917 000 0000 · KieAn Tutorial Center');
});

test('compliance: every public page and parent email identifies the business; bookings need separate privacy consent',async t=>{
  const app=createApp({config:{...config,preview:true}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>app.close(r)));
  const base='http://127.0.0.1:'+app.address().port;
  for(const p of ['/','/booking','/faq','/payment','/contact','/privacy-policy','/terms','/refund-policy','/cookie-policy','/consent-form']){
    const html=await (await fetch(base+p)).text();
    assert.match(html,/DTI Business Name No\. 2828786/,p);assert.match(html,/Natania Homes/,p);assert.match(html,/kieanadmin@gmail\.com/,p);assert.match(html,/href="\/contact"/,p);
  }
  const privacy=await (await fetch(base+'/privacy-policy')).text();
  assert.match(privacy,/Data Protection Officer is <strong>Kierlle B\. Piad<\/strong>/);assert.match(privacy,/sensitive personal information/);assert.match(privacy,/within 72 hours/);
  const email=parentScheduleEmail({...validateBooking(payload(),config,NOW),id:'b1',reference:'KTC-TEST0002',paid:false});
  assert(email.html.includes('DTI Business Name No. 2828786'));assert(email.text.includes(BUSINESS));
  assert.throws(()=>validateBooking({...payload(),privacyConsent:false},config,NOW),/personal information/);
});
