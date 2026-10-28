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
import {mime,teacherEmail,parentScheduleEmail} from '../lib/mailer.mjs';
import {loadConfig,validateTeacherRoster} from '../lib/config.mjs';
import {createApp} from '../server.mjs';
import {icsForBooking,PREVIEW_TEACHERS,PROGRAMS,slotsForDay,manilaDay,sessionRate,addDays,scheduleSummary} from '../shared.mjs';
const NOW=new Date('2030-06-01T00:00:00Z');
const config={preview:false,publicOrigin:'https://kiean.example',leadMinutes:60,teachers:[{...PREVIEW_TEACHERS[0],id:'teacher-1',name:'Test Teacher',googleEmail:'teacher@example.test'}]};
const payload=()=>({requestId:randomUUID(),teacher:'teacher-1',program:'online',branch:'online',dates:['2030-06-03','2030-06-04','2030-06-05','2030-06-06','2030-06-07'],time:'10:00',parentName:'Test Parent',email:'parent@example.test',phone:'+639171234567',studentName:'Learner',grade:'Grade 3',notes:'Reading practice',consent:true});
function fakeCalendar(options={}){return {events:new Map(),creates:0,removes:0,async busy(){if(options.busyError)throw new Error('Offline');return options.busy||[];},async create(b,s){this.creates++;this.events.set(s.date,s);if(options.failAt===this.creates){const e=new Error('Write failed');if(!options.uncertain)e.status=400;throw e;}return {};},async remove(b,s){this.removes++;if(options.deleteError)throw new Error('Offline');this.events.delete(s.date);},invites:0,async createInvite(){this.invites++;return {hangoutLink:'https://meet.google.com/kie-ann-abc'};},async removeInvite(){this.invites--;}};}
function harness(t,options={}){const store=new BookingStore(':memory:');t.after(()=>store.close());const calendar=fakeCalendar(options),service=new BookingService(config,store,calendar);return {store,calendar,service};}
test('five Mon–Fri dates create five equal slots in Philippine Time',async t=>{
  const {service,calendar}=harness(t);const b=await service.book(payload(),NOW);assert.equal(b.sessions.length,5);assert.equal(calendar.events.size,5);assert.equal(b.sessions[0].start,'2030-06-03T02:00:00.000Z');assert.equal(b.sessions[0].end,'2030-06-03T03:00:00.000Z');assert.equal(b.lessonMinutes,50);
});
test('server enforces minimum, uniqueness, range, grade, consent and teacher hours',()=>{
  for(const change of [{dates:payload().dates.slice(0,4)},{dates:Array(5).fill('2030-06-03')},{dates:['2030-02-30',...payload().dates.slice(1)]},{dates:['2030-06-02',...payload().dates.slice(1)]},{time:'17:00'},{time:'10:17'},{grade:'Grade 7'},{consent:false},{dates:[null,...payload().dates.slice(1)]},{dates:['2031-06-03',...payload().dates.slice(1)]},{teacher:'not-a-teacher'},{email:'invalid'}])assert.throws(()=>validateBooking({...payload(),...change},config,NOW));
});
test('online needs 5 sessions and face-to-face programs need 20',()=>{
  for(const program of PROGRAMS){
    const dates=program.mode==='online'?payload().dates.slice(0,4):payload().dates;
    assert.equal(program.minSessions,program.mode==='online'?5:20);
    assert.throws(()=>validateBooking({...payload(),program:program.id,branch:program.mode==='online'?'online':'natania',dates},config,NOW),new RegExp(`between ${program.minSessions} `));
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
  assert.equal(sessionRate('online','online'),200);assert.equal(sessionRate('academic','natania'),150);assert.equal(sessionRate('sped','pila'),300);
  assert.equal(sessionRate('academic','san-pedro'),250);assert.equal(sessionRate('sped','san-pedro'),400);assert.equal(sessionRate('after-school','san-pedro'),150);
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
  const b=await service.book({...payload(),program:'academic',branch:'san-pedro',dates:weekdays(20)},NOW);
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
  assert.throws(()=>validateBooking({...payload(),program:'academic',branch:'natania',time:'14:00',dates:weekdays(20)},cfg,NOW),/outside this teacher/);
  assert.equal(validateBooking({...payload(),program:'sped',branch:'natania',time:'14:00',dates:weekdays(20)},cfg,NOW).sessions.length,20);
});
test('roster validation accepts known period types only',()=>{
  const base={...config.teachers[0]};
  assert.doesNotThrow(()=>validateTeacherRoster([{...base,weekly:{1:[['09:00','12:00','online'],['13:00','15:00','sped']]}}]));
  assert.throws(()=>validateTeacherRoster([{...base,weekly:{1:[['09:00','12:00','vip']]}}]),/working hours/);
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
