import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BookingStore} from '../lib/store.mjs';
import {BookingService} from '../lib/booking-service.mjs';
import {GoogleCalendar} from '../lib/calendar.mjs';
import {validateBooking} from '../lib/domain.mjs';
import {createApp} from '../server.mjs';
import {icsForBooking,PREVIEW_TEACHERS,PROGRAMS,slotsForDay,manilaDay} from '../shared.mjs';
const NOW=new Date('2030-06-01T00:00:00Z');
const config={preview:false,publicOrigin:'https://kiean.example',leadMinutes:60,teachers:[{...PREVIEW_TEACHERS[0],id:'teacher-1',name:'Test Teacher',calendarId:'teacher@example.test'}]};
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
test('Google adapter rejects per-calendar errors and uses valid deterministic ids',async()=>{
  const calendar=new GoogleCalendar({});calendar.request=async()=>({calendars:{'test@example.test':{errors:[{reason:'notFound'}]}}});await assert.rejects(calendar.busy('test@example.test','2030-06-01','2030-06-30'),/could not be verified/);assert.match(calendar.eventId({id:'123'},'2030-06-03'),/^[0-9a-v]{5,1024}$/);
});
test('Google adapter signs and caches tokens, creates 60-minute private events',async()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const calls=[];
  const c=new GoogleCalendar({client_email:'service@example.test',private_key:privateKey.export({type:'pkcs8',format:'pem'})},async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.includes('oauth2')?{access_token:'mock-token',expires_in:3600}:{id:'mock-event'}),{status:200});});
  const b={...validateBooking(payload(),config,NOW),id:'123',reference:'KTC-TEST'};await c.create(b,b.sessions[0]);await c.create(b,b.sessions[1]);assert.equal(calls.filter(x=>x.url.includes('oauth2')).length,1);const resource=JSON.parse(calls[1].options.body);assert.equal(resource.start.timeZone,'Asia/Manila');assert.equal(resource.visibility,'private');assert.equal(resource.transparency,'opaque');assert.equal(resource.attendees,undefined);assert.equal(Date.parse(resource.end.dateTime)-Date.parse(resource.start.dateTime),3600000);
});
test('HTTP blocks private files, preview submissions and cross-origin writes',async t=>{
  const app=createApp({config:{...config,preview:true}});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));const base='http://127.0.0.1:'+app.address().port;
  for(const path of ['/config.json','/data/bookings.sqlite','/lib/calendar.mjs','/secrets/google.json'])assert.equal((await fetch(base+path)).status,404);
  const pub=await (await fetch(base+'/api/config')).json();assert.equal(pub.teachers[0].calendarId,undefined);
  assert.equal((await fetch(base+'/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())})).status,503);
  const live=createApp({config,service:{book(){throw new Error('must not reach');}}});await new Promise(r=>live.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>live.close(r)));assert.equal((await fetch('http://127.0.0.1:'+live.address().port+'/api/bookings',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:JSON.stringify(payload())})).status,403);
});
