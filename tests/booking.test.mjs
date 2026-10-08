import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BookingStore} from '../lib/store.mjs';
import {BookingService} from '../lib/booking-service.mjs';
import {GoogleCalendar} from '../lib/calendar.mjs';
import {GoogleOAuth,GOOGLE_SCOPES} from '../lib/google-oauth.mjs';
import {validateBooking} from '../lib/domain.mjs';
import {createApp} from '../server.mjs';
import {icsForBooking,PREVIEW_TEACHERS,PROGRAMS,slotsForDay,manilaDay} from '../shared.mjs';
const NOW=new Date('2030-06-01T00:00:00Z');
const config={preview:false,publicOrigin:'https://kiean.example',leadMinutes:60,teachers:[{...PREVIEW_TEACHERS[0],id:'teacher-1',name:'Test Teacher',googleEmail:'teacher@example.test'}]};
const payload=()=>({requestId:randomUUID(),teacher:'teacher-1',program:'online',branch:'online',dates:['2030-06-03','2030-06-04','2030-06-05','2030-06-06','2030-06-07'],time:'10:00',parentName:'Test Parent',email:'parent@example.test',phone:'+639171234567',studentName:'Learner',grade:'Grade 3',notes:'Reading practice',consent:true});
function fakeCalendar(options={}){return {events:new Map(),creates:0,removes:0,async busy(){if(options.busyError)throw new Error('Offline');return options.busy||[];},async create(b,s){this.creates++;this.events.set(s.date,s);if(options.failAt===this.creates){const e=new Error('Write failed');if(!options.uncertain)e.status=400;throw e;}return {};},async remove(b,s){this.removes++;if(options.deleteError)throw new Error('Offline');this.events.delete(s.date);}};}
function harness(t,options={}){const store=new BookingStore(':memory:');t.after(()=>store.close());const calendar=fakeCalendar(options),service=new BookingService(config,store,calendar);return {store,calendar,service};}
test('five Mon–Fri dates create five equal slots in Philippine Time',async t=>{
  const {service,calendar}=harness(t);const b=await service.book(payload(),NOW);assert.equal(b.sessions.length,5);assert.equal(calendar.events.size,5);assert.equal(b.sessions[0].start,'2030-06-03T02:00:00.000Z');assert.equal(b.sessions[0].end,'2030-06-03T03:00:00.000Z');assert.equal(b.lessonMinutes,50);
});
test('server enforces minimum, uniqueness, range, grade, consent and teacher hours',()=>{
  for(const change of [{dates:payload().dates.slice(0,4)},{dates:Array(5).fill('2030-06-03')},{dates:['2030-02-30',...payload().dates.slice(1)]},{dates:['2030-06-02',...payload().dates.slice(1)]},{time:'17:00'},{time:'10:17'},{grade:'Grade 7'},{consent:false},{dates:[null,...payload().dates.slice(1)]},{dates:['2031-06-03',...payload().dates.slice(1)]},{teacher:'not-a-teacher'},{email:'invalid'}])assert.throws(()=>validateBooking({...payload(),...change},config,NOW));
});
test('all booking programs enforce minimum of five',()=>{
  for(const program of PROGRAMS)assert.throws(()=>validateBooking({...payload(),program:program.id,branch:program.mode==='online'?'online':'natania',dates:payload().dates.slice(0,4)},config,NOW),/between 5/);
});
test('overlapping time slots and concurrent requests cannot double-book',async t=>{
  const {service,calendar}=harness(t);const a=payload(),b={...payload(),time:'10:30'};
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
  const b={...validateBooking(payload(),config,NOW),id:'123',reference:'KTC-TEST'};await c.create(b,b.sessions[0]);await c.create(b,b.sessions[1]);assert.equal(refreshes,1);const resource=JSON.parse(calls[0].options.body);assert.match(calls[0].url,/calendars\/primary\/events/);assert.equal(resource.start.timeZone,'Asia/Manila');assert.equal(resource.visibility,'private');assert.equal(resource.transparency,'opaque');assert.equal(resource.attendees,undefined);assert.equal(Date.parse(resource.end.dateTime)-Date.parse(resource.start.dateTime),3600000);
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
