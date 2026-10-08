import {PROGRAMS,BRANCHES,PREVIEW_TEACHERS,MIN_SESSIONS,MAX_SESSIONS,HORIZON_DAYS,manilaDay,addDays,weekday,clock,minutes,instant,timeLabel,slotLabel,dateLabel,slotsForDay,icsForBooking} from './shared.mjs';
const $=id=>document.getElementById(id);
const q=new URLSearchParams(location.search);
const today=manilaDay();
const state={step:1,mode:q.get('mode')==='branch'?'branch':'online',program:q.get('program')||'online',branch:BRANCHES[0].id,teacher:'',dates:[],time:'',month:today.slice(0,7),teachers:[],preview:true,availability:{},common:[],request:0,requestId:crypto.randomUUID(),locked:false,busy:false,confirmation:null};
const getProgram=()=>PROGRAMS.find(p=>p.id===state.program);
const getTeacher=()=>state.teachers.find(t=>t.id===state.teacher);
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function showError(message){$('error').textContent=message;$('error').hidden=false;$('error').focus();}
function clearError(){$('error').hidden=true;}
function resetSchedule(){state.request++;state.busy=false;state.dates=[];state.time='';state.common=[];state.availability={};state.requestId=crypto.randomUUID();updateSummary();}
async function api(path,options={}) {
  const res=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  let data;try{data=await res.json();}catch{throw new Error('Booking is temporarily unavailable. Please try again or contact the center.');}
  if(!res.ok){const e=new Error(data.error||'Unable to complete this request.');e.data=data;throw e;}
  return data;
}
async function init(){
  try{const config=await api('/api/config');state.preview=config.preview;state.teachers=config.teachers;}
  catch{state.preview=true;state.teachers=PREVIEW_TEACHERS;}
  $('connection-status').textContent=state.preview?'Preview mode — sample teacher and availability. No booking is saved and Google Calendar is not updated.':'Choose a teacher’s available dates. Confirmed sessions are added to the teacher’s Google Calendar.';
  $('connection-status').classList.toggle('live',!state.preview);
  $('submit-booking').textContent=state.preview?'Preview my sessions →':'Confirm sessions →';
  $('calendar-note').textContent=state.preview?'This is a preview. Google Calendar is not connected.':'Confirmed sessions will appear in the teacher’s Google Calendar.';
  for(const branch of BRANCHES){const opt=node('option',branch.name);opt.value=branch.id;$('branch').append(opt);}
  renderPrograms();
}
function renderPrograms(){
  const programs=PROGRAMS.filter(p=>p.mode===state.mode);
  if(!programs.some(p=>p.id===state.program))state.program=programs[0].id;
  $('program').replaceChildren(...programs.map(p=>{const opt=node('option',p.name);opt.value=p.id;return opt;}));$('program').value=state.program;
  $('branch-field').hidden=state.mode!=='branch';
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
  const p=getProgram();$('program-info').replaceChildren(node('strong',`${p.note} · ${p.lessonMinutes}-minute lesson`),node('span',p.price+(state.mode==='branch'?' · Other session counts are quoted by the center.':'')));
  renderTeachers();
}
function renderTeachers(){
  const eligible=state.teachers.filter(t=>t.programs.includes(state.program)&&t.branches.includes(state.mode==='online'?'online':state.branch));
  if(!eligible.some(t=>t.id===state.teacher&&(state.preview||t.googleConnected)))state.teacher='';
  $('teachers').replaceChildren(...eligible.map(t=>{
    const connected=state.preview||t.googleConnected;const card=node('label',undefined,'teacher-card');const radio=node('input');radio.type='radio';radio.name='teacher';radio.value=t.id;radio.checked=t.id===state.teacher;radio.disabled=!connected;
    radio.addEventListener('change',()=>{state.teacher=t.id;resetSchedule();renderTeachers();});
    const avatar=node('span',t.name.split(' ').map(s=>s[0]).slice(0,2).join(''),'teacher-avatar');avatar.setAttribute('aria-hidden','true');const copy=node('span');copy.append(node('strong',t.name),node('small',connected?(t.bio||'Choose this teacher to see available dates.'):'Google Calendar setup is pending. Please contact the center.'));card.append(radio,avatar,copy);return card;
  }));
  if(!eligible.length)$('teachers').append(node('p','No teacher is available for this program and branch yet. Please contact the center.','empty-teachers'));
  $('to-dates').disabled=!state.teacher;updateSummary();
}
function updateSummary(){
  const p=getProgram();$('summary-program').textContent=p.name;$('summary-teacher').textContent=getTeacher()?.name||'Choose a teacher';$('summary-time').textContent=state.time?slotLabel(state.time,p.slotMinutes):'Choose a time slot';$('summary-location-row').hidden=state.mode!=='branch';$('summary-location').textContent=BRANCHES.find(b=>b.id===state.branch)?.name||'';
  $('session-count').textContent=`${state.dates.length} session${state.dates.length===1?'':'s'}`;$('minimum-status').textContent=state.dates.length>=MIN_SESSIONS?'Minimum met ✓':'Minimum 5';$('session-progress').value=Math.min(MIN_SESSIONS,state.dates.length);$('session-hint').textContent=state.dates.length>=MIN_SESSIONS?'One teacher and one shared time for every date.':`Select ${MIN_SESSIONS-state.dates.length} more date${MIN_SESSIONS-state.dates.length===1?'':'s'} to reach the minimum.`;
  $('duration-note').textContent=p.id==='online'?'50 minutes of focused learning, plus 10 minutes between lessons.':'Each lesson lasts 60 minutes. All selected dates use the same time slot.';
  $('to-details').disabled=state.busy||state.dates.length<MIN_SESSIONS||!state.time||!state.common.includes(state.time);
}
function go(step){
  if(state.locked)return;clearError();state.step=step;
  for(let n=1;n<=3;n++)$('step-'+n).hidden=n!==step;
  document.querySelectorAll('.booking-steps li').forEach((li,i)=>{li.classList.toggle('done',i+1<step);if(i+1===step)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
  if(step===2)loadAvailability();if(step===3)renderReview();$('step-'+step+'-title').focus();
}
function monthBounds(){const first=state.month+'-01';const [y,m]=state.month.split('-').map(Number);const last=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);return {first,last};}
async function loadAvailability(){
  const request=++state.request;state.busy=true;state.common=[];state.availability={};$('time-status').textContent='Checking shared availability…';$('time-slots').replaceChildren();updateSummary();renderCalendar();
  try{
    const {first,last}=monthBounds();let data;
    if(state.preview){
      const dates={};for(let d=first;d<=last;d=addDays(d,1))dates[d]=slotsForDay(getTeacher(),getProgram(),d);
      const chosen=state.dates.map(d=>slotsForDay(getTeacher(),getProgram(),d));
      data={dates,common:chosen.length?chosen[0].filter(t=>chosen.every(s=>s.includes(t))):[]};
    }else{
      const params=new URLSearchParams({teacher:state.teacher,program:state.program,branch:state.mode==='online'?'online':state.branch,month:state.month,dates:state.dates.join(',')});
      data=await api('/api/availability?'+params);
    }
    if(request!==state.request)return;
    state.availability=data.dates;state.common=data.common;if(!state.common.includes(state.time))state.time='';
    $('time-status').textContent=state.dates.length?(state.common.length?'Available on all selected dates.':'No shared time is available. Remove a date or select different dates.'):'';
    renderTimes();
  }catch(error){if(request!==state.request)return;state.time='';$('time-status').textContent='Availability could not be verified.';showError(error.message);}
  finally{if(request===state.request){state.busy=false;renderCalendar();updateSummary();}}
}
function renderCalendar(){
  const {first,last}=monthBounds();$('calendar-title').textContent=new Intl.DateTimeFormat('en-PH',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(first+'T12:00:00Z'));
  $('prev-month').disabled=state.month<=today.slice(0,7);$('next-month').disabled=state.month>=addDays(today,HORIZON_DAYS).slice(0,7);$('add-week').disabled=state.busy;
  const cells=[];const blanks=(weekday(first)+6)%7;for(let i=0;i<blanks;i++)cells.push(node('span'));
  for(let date=first;date<=last;date=addDays(date,1)){
    const d=date;const selected=state.dates.includes(d);const button=node('button',String(Number(d.slice(-2))),'date-cell'+(d===today?' today':''));button.type='button';button.dataset.date=d;button.setAttribute('aria-label',dateLabel(d)+(selected?', selected':''));button.setAttribute('aria-pressed',String(selected));button.disabled=state.busy||(!selected&&(!state.availability[d]?.length||state.dates.length>=MAX_SESSIONS));button.addEventListener('click',()=>toggleDate(d));cells.push(button);
  }
  $('calendar').replaceChildren(...cells);$('selected-dates').replaceChildren(...state.dates.map(d=>{const chip=node('span',undefined,'date-chip');chip.append(node('span',dateLabel(d,true)));const remove=node('button','×');remove.type='button';remove.setAttribute('aria-label','Remove '+dateLabel(d));remove.disabled=state.busy;remove.addEventListener('click',()=>toggleDate(d));chip.append(remove);return chip;}));
}
function toggleDate(date){if(state.busy)return;clearError();state.dates=state.dates.includes(date)?state.dates.filter(d=>d!==date):[...state.dates,date].sort();state.requestId=crypto.randomUUID();loadAvailability();}
function renderTimes(){
  $('time-help').textContent=state.dates.length?`${getProgram().lessonMinutes}-minute lessons. Choose one slot for all ${state.dates.length} selected dates.`:'Select your dates to see shared availability.';
  $('time-slots').replaceChildren(...state.common.map(t=>{const b=node('button',slotLabel(t,getProgram().slotMinutes),'time-slot');b.type='button';b.dataset.time=t;b.setAttribute('aria-pressed',String(state.time===t));b.addEventListener('click',()=>{state.time=t;state.requestId=crypto.randomUUID();renderTimes();updateSummary();});return b;}));
}
async function addWeek(){
  if(state.busy)return;clearError();
  let start=state.dates.length?addDays(state.dates.at(-1),1):state.month+'-01';if(start<today)start=today;
  start=addDays(start,(8-weekday(start))%7);
  const limit=addDays(today,HORIZON_DAYS);let found=false;
  for(let tries=0;tries<27&&addDays(start,4)<=limit;tries++,start=addDays(start,7)){
    const week=Array.from({length:5},(_,i)=>addDays(start,i));
    if(week.every(d=>slotsForDay(getTeacher(),getProgram(),d).length)){state.dates=[...new Set([...state.dates,...week])].sort();if(state.dates.length>MAX_SESSIONS){state.dates=state.dates.filter(d=>!week.includes(d));showError('A booking can include up to 40 sessions.');return;}state.month=start.slice(0,7);found=true;break;}
  }
  if(!found){showError('No full Monday–Friday week fits this teacher’s working schedule. Please choose dates individually.');return;}
  state.requestId=crypto.randomUUID();await loadAvailability();
}
function renderReview(){
  $('review-sessions').replaceChildren(...sessionRows(state.dates.map(date=>({date})),state.time));
  $('fee-note').textContent=getProgram().price+'. The five-session booking minimum is a scheduling rule. Published package prices are not automatically prorated; KieAn will confirm the applicable fee. No payment is collected here.';
}
function sessionRows(sessions,time){return sessions.map(s=>{const row=node('div',undefined,'review-session');row.append(node('span',dateLabel(s.date)),node('span',slotLabel(time,getProgram().slotMinutes)));return row;});}
function lockForm(lock){state.locked=lock;document.querySelectorAll('#booking-form input,#booking-form select,#booking-form textarea,#booking-form button').forEach(el=>el.disabled=lock);}
$('booking-form').addEventListener('input',()=>{if(!state.locked)state.requestId=crypto.randomUUID();});
$('booking-form').addEventListener('submit',async event=>{
  event.preventDefault();if(state.locked)return;clearError();if(state.dates.length<MIN_SESSIONS||!state.time){showError('Select at least five dates and one shared time.');return;}
  const fields=Object.fromEntries(new FormData(event.target));const payload={...fields,consent:fields.consent==='on',teacher:state.teacher,program:state.program,branch:state.mode==='online'?'online':state.branch,dates:state.dates,time:state.time,requestId:state.requestId};lockForm(true);$('submit-booking').textContent=state.preview?'Preparing preview…':'Checking dates and updating calendar…';
  try{
    let result;
    if(state.preview){const p=getProgram();result={id:state.requestId,reference:'PREVIEW ONLY',preview:true,programName:p.name,lessonMinutes:p.lessonMinutes,teacherName:getTeacher().name,time:state.time,sessions:state.dates.map(date=>({date,start:instant(date,state.time).toISOString(),end:instant(date,clock(minutes(state.time)+p.slotMinutes)).toISOString()}))};}
    else result=await api('/api/bookings',{method:'POST',body:JSON.stringify(payload)});
    state.confirmation=result;showConfirmation(result);
  }catch(error){
    if(error.data?.reference)showError(error.message+' Reference: '+error.data.reference);else showError(error.message);
    if(error.data?.conflicts?.length){state.time='';updateSummary();}
  }finally{lockForm(false);$('submit-booking').textContent=state.preview?'Preview my sessions →':'Confirm sessions →';}
});
function showConfirmation(b){
  for(let i=1;i<=3;i++)$('step-'+i).hidden=true;
  document.querySelectorAll('.booking-steps li').forEach(li=>{li.classList.add('done');li.removeAttribute('aria-current');});
  const panel=$('confirmation');panel.replaceChildren(node('div',b.preview?'✦':'✓','confirmation-icon'),node('h2',b.preview?'Your learning plan is ready to preview.':'Your sessions are booked.'),node('p',b.preview?'This preview has not reserved any sessions or updated Google Calendar.':`All ${b.sessions.length} sessions were added to your teacher’s Google Calendar.`),node('p',b.reference,'reference'));
  const review=node('div',undefined,'review-box');review.append(node('h3',b.teacherName),...sessionRows(b.sessions,b.time));panel.append(review);
  const actions=node('div',undefined,'panel-actions');const download=node('button',b.preview?'Download preview calendar':'Download my calendar','btn btn-orange');download.type='button';download.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([icsForBooking(b)],{type:'text/calendar;charset=utf-8'}));const a=node('a');a.href=url;a.download=b.preview?'kiean-preview.ics':`kiean-${b.reference}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);});const again=node('a','Start a new booking','btn btn-outline');again.href='booking.html';actions.append(download,again);panel.append(actions,node('p',b.preview?'Live booking opens after the center connects its teachers and calendars.':'Save this reference. Contact the center for lesson access details, fees or changes to these sessions.'));panel.hidden=false;panel.focus();
}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;state.teacher='';resetSchedule();renderPrograms();}));
$('program').addEventListener('change',e=>{state.program=e.target.value;state.teacher='';resetSchedule();renderPrograms();});$('branch').addEventListener('change',e=>{state.branch=e.target.value;state.teacher='';resetSchedule();renderTeachers();});
$('to-dates').addEventListener('click',()=>go(2));$('to-details').addEventListener('click',()=>go(3));document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.back))));
for(const [id,diff] of [['prev-month',-1],['next-month',1]])$(id).addEventListener('click',()=>{const [y,m]=state.month.split('-').map(Number);state.month=new Date(Date.UTC(y,m-1+diff,1)).toISOString().slice(0,7);loadAvailability();});
$('clear-dates').addEventListener('click',()=>{if(state.busy)return;state.dates=[];state.time='';state.requestId=crypto.randomUUID();loadAvailability();});$('add-week').addEventListener('click',addWeek);
init();
