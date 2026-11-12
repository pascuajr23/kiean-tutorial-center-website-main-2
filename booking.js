import {PROGRAMS,setPrograms,bookable,DEFAULT_BRANCHES,AREAS,branchById,areaBranches,offers,teacherServes,matchArea,PREVIEW_TEACHERS,sessionRate,careTiming,kiddieQuote,KIDDIE_CARE,KIDDIE_NOTES,peso,totalLabel,ATTACHMENT_TYPES,MAX_ATTACHMENT_BYTES,MAX_REQUEST_FILES,MAX_SESSIONS,HORIZON_DAYS,manilaDay,addDays,weekday,instant,timeLabel,slotLabel,dateLabel,slotsForDay,icsForBooking} from './shared.mjs';
const $=id=>document.getElementById(id);
const q=new URLSearchParams(location.search);
const today=manilaDay();
const state={step:1,mode:q.get('mode')==='branch'?'branch':'online',program:q.get('program')||'online',branch:'',branches:DEFAULT_BRANCHES,teacher:'',dates:[],time:'',month:today.slice(0,7),teachers:[],preview:true,availability:{},common:[],request:0,requestId:crypto.randomUUID(),locked:false,busy:false,confirmation:null,area:'',care:'day',needs:'regular',plan:'per-day',hours:4,tutorial:false};
const getProgram=()=>PROGRAMS.find(p=>p.id===state.program);
const getTeacher=()=>state.teachers.find(t=>t.id===state.teacher);
const getArea=()=>AREAS.find(a=>a.id===state.area);
// Kiddie Care: the care type and hours set the slot length and period; a monthly plan is 20 weekdays.
const getTiming=()=>careTiming(getProgram(),state);
const getLength=()=>getTiming().length;
// A fixed session count (minimum = maximum, e.g. Nursery's month) books like a monthly plan: one start date fills it.
const carePlan=()=>Boolean(getProgram().care&&state.plan==='monthly');
const monthly=()=>carePlan()||getProgram().maxSessions===getProgram().minSessions;
const minDates=()=>carePlan()?20:getProgram().minSessions;
const maxDates=()=>carePlan()?20:getProgram().maxSessions??MAX_SESSIONS;
const slots=d=>slotsForDay(getTeacher(),getProgram(),d,undefined,60,getLength(),getTiming().periodType);
const quote=()=>{try{return getProgram().care?kiddieQuote({...state,days:state.dates.length}):null;}catch{return null;}};
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function showError(message){$('error').textContent=message;$('error').hidden=false;$('error').focus();}
function clearError(){$('error').hidden=true;}
function resetSchedule(){state.request++;state.busy=false;state.dates=[];state.time='';state.common=[];state.availability={};state.availKey='';state.requestId=crypto.randomUUID();updateSummary();}
async function api(path,options={}) {
  const res=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  let data;try{data=await res.json();}catch{throw new Error('Booking is temporarily unavailable. Please try again or contact the center.');}
  if(!res.ok){const e=new Error(data.error||'Unable to complete this request.');e.data=data;throw e;}
  return data;
}
async function init(){
  try{const config=await api('/api/config');state.preview=config.preview;state.teachers=config.teachers;state.paymentInstructions=config.paymentInstructions;state.branches=config.branches||DEFAULT_BRANCHES;if(config.programs)setPrograms(config.programs);}
  catch{state.preview=true;state.teachers=PREVIEW_TEACHERS;}
  $('connection-status').textContent=state.preview?'Preview mode — sample teacher and availability. No booking is saved and Google Calendar is not updated.':'Live availability. Confirmed sessions go straight to the teacher’s Google Calendar.';
  $('connection-status').classList.toggle('live',!state.preview);
  $('submit-booking').textContent=state.preview?'Preview my sessions →':'Confirm sessions →';
  $('calendar-note').textContent=state.preview?'This is a preview. Google Calendar is not connected.':'Confirmed sessions will appear in the teacher’s Google Calendar.';
  // Province first (PDF geo-fence regions), then that province's cities and municipalities.
  for(const region of ['Cavite','Laguna','Batangas','Metro Manila','Other Luzon']){const opt=node('option',region==='Other Luzon'?'Other provinces':region);opt.value=region;$('province').append(opt);}
  const none=node('option','My area is not listed');none.value='none';$('province').append(none);
  $('care').replaceChildren(...Object.entries(KIDDIE_CARE).map(([id,c])=>{const opt=node('option',c.label);opt.value=id;return opt;}));
  $('step-1').classList.remove('is-loading');$('step-1').removeAttribute('aria-busy');
  renderPrograms();
}
function renderPrograms(){
  // Branch lessons: only branches serving the parent's area, and only the programs that branch offers.
  const area=getArea(),branches=state.mode==='branch'?(areaBranches(state.branches,state.area)):[];
  // Location comes first: format, program, branch and teacher appear only once the area is known.
  document.querySelectorAll('[data-needs-area]').forEach(el=>{el.hidden=!area;});
  if(branches.length&&!branches.includes(state.branch))state.branch=branches.find(b=>offers(state.branches,b,state.program))||branches[0];
  $('branch').replaceChildren(...branches.map(id=>{const opt=node('option',branchById(state.branches,id).name);opt.value=id;return opt;}));$('branch').value=state.branch;
  // Online and branch lessons both follow the parent's area (online teachers serve their own branches' areas).
  const programs=!area?[]:state.mode==='online'?PROGRAMS.filter(p=>bookable(p)&&p.mode==='online'):PROGRAMS.filter(p=>bookable(p)&&p.mode==='branch'&&branches.length&&offers(state.branches,state.branch,p.id));
  if(!programs.length){
    $('program').replaceChildren();$('branch-field').hidden=!branches.length;$('care-fields').hidden=true;
    $('program-info').replaceChildren(...(state.area==='none'||area?[node('strong','No KieAn branch or teacher serves your area yet.'),node('span','Please message the center on Facebook and we will help you.')]:[]));
    $('teachers').replaceChildren();state.teacher='';$('to-dates').disabled=true;$('mode').value=state.mode;updateSummary();return;
  }
  if(!programs.some(p=>p.id===state.program))state.program=programs[0].id;
  $('program').replaceChildren(...programs.map(p=>{const opt=node('option',p.name);opt.value=p.id;return opt;}));$('program').value=state.program;
  $('branch-field').hidden=state.mode!=='branch';
  $('mode').value=state.mode;
  renderCare();
  $('session-rule').textContent=monthly()?(getProgram().care?'20 school days, Mon–Fri':`${minDates()} class days`):getProgram().minSessions>1?`${getProgram().minSessions}+ sessions`:'1 or more days';
  const p=getProgram();$('program-info').replaceChildren(node('strong',p.care?p.note:[p.note,`${p.lessonMinutes}-minute ${p.group?'class':'lesson'}`].filter(Boolean).join(' · ')),node('span',(p.price||'Fees confirmed by the center')+(state.mode==='branch'&&!p.group?' · Other session counts are quoted by the center.':'')));
  renderTeachers();
}
// Only the care types, hours and plans that have a price (set in /admin) are offered for the chosen child needs.
function renderCare(){
  const p=getProgram();$('care-fields').hidden=!p.care;if(!p.care)return;
  const priced=o=>{try{kiddieQuote({...state,tutorial:false,days:1,...o});return true;}catch{return false;}};
  const hoursFor=(care,plan)=>(KIDDIE_CARE[care]?.hours||[]).filter(hours=>priced({care,plan,hours}));
  const typesFor=()=>Object.keys(KIDDIE_CARE).filter(id=>hoursFor(id,'per-day').length||hoursFor(id,'monthly').length);
  if(!typesFor().length)state.needs=state.needs==='special'?'regular':'special';
  const types=typesFor();if(!types.includes(state.care))state.care=types[0];
  $('care').replaceChildren(...types.map(id=>{const opt=node('option',KIDDIE_CARE[id].label);opt.value=id;return opt;}));
  const c=KIDDIE_CARE[state.care],dayHours=hoursFor(state.care,'per-day'),monthHours=hoursFor(state.care,'monthly');
  if(!monthHours.length)state.plan='per-day';else if(!dayHours.length)state.plan='monthly';
  const hours=state.plan==='monthly'?monthHours:dayHours;
  if(!hours.includes(state.hours))state.hours=hours[0];
  const tutorialPrice=c.tutorial?.[state.plan==='monthly'?'month':'day']?.[state.needs];
  if(!tutorialPrice)state.tutorial=false;
  const price=h=>kiddieQuote({...state,hours:h,tutorial:false,days:1}).unit;
  $('care').value=state.care;$('needs').value=state.needs;$('plan').value=state.plan;$('plan-field').hidden=!(monthHours.length&&dayHours.length);
  $('hours').replaceChildren(...hours.map(h=>{const opt=node('option',`${h} hour${h>1?'s':''} · ${peso(price(h))}${state.plan==='monthly'?'/month':c.perHour?'':'/'+c.unit}`);opt.value=h;return opt;}));$('hours').value=state.hours;
  $('tutorial-field').hidden=!tutorialPrice;$('tutorial').checked=state.tutorial;
  if(tutorialPrice)$('tutorial-label').textContent=`Add academic tutorial · ${peso(tutorialPrice)}/${state.plan==='monthly'?'month':'day'}`;
  const one=kiddieQuote({...state,days:1});$('care-price').textContent=state.plan==='monthly'?`${peso(one.total)} for the month · 20 school days, Mon–Fri`:`${peso(one.unit)} per ${c.unit}${c.night?' · may end after midnight':''}`;
}
function renderTeachers(){
  const eligible=state.teachers.filter(t=>t.available!==false&&t.programs.includes(state.program)&&t.branches.includes(bookingBranch())&&offers(state.branches,bookingBranch(),state.program)&&(state.mode==='branch'||teacherServes(t,state.area,state.branches)));
  if(!eligible.some(t=>t.id===state.teacher&&(state.preview||t.googleConnected)))state.teacher='';
  const ready=eligible.filter(t=>state.preview||t.googleConnected);if(!state.teacher&&ready.length===1)state.teacher=ready[0].id;
  $('teachers').replaceChildren(...eligible.map(t=>{
    const connected=state.preview||t.googleConnected;const card=node('label',undefined,'teacher-card');const radio=node('input');radio.type='radio';radio.name='teacher';radio.value=t.id;radio.checked=t.id===state.teacher;radio.disabled=!connected;
    radio.addEventListener('change',()=>{state.teacher=t.id;resetSchedule();renderTeachers();});
    const avatar=node('span',t.name.split(' ').map(s=>s[0]).slice(0,2).join(''),'teacher-avatar');avatar.setAttribute('aria-hidden','true');const copy=node('span');copy.append(node('strong',t.name),node('small',connected?(t.bio||'Choose this teacher to see available dates.'):'Google Calendar setup is pending. Please contact the center.'));card.append(radio,avatar,copy);return card;
  }));
  if(!eligible.length)$('teachers').append(node('p',state.mode==='online'?'No online teacher serves your area yet. Please contact the center.':'No teacher is available for this program and branch yet. Please contact the center.','empty-teachers'));
  $('to-dates').disabled=!state.teacher;updateSummary();
}
function updateSummary(){
  const p=getProgram();$('summary-program').textContent=p.name;$('summary-teacher').textContent=getTeacher()?.name||'Choose a teacher';$('summary-time').textContent=state.time?slotLabel(state.time,getLength()):'Choose a time slot';$('summary-location-row').hidden=state.mode!=='branch';$('summary-location').textContent=branchById(state.branches,state.branch)?.name||'';
  $('session-count').textContent=`${state.dates.length} session${state.dates.length===1?'':'s'}`;$('minimum-status').textContent=`${state.dates.length} / ${minDates()}${state.dates.length>=minDates()?' ✓':''}`;$('session-progress').max=minDates();$('session-progress').value=Math.min(minDates(),state.dates.length);$('session-hint').textContent=state.dates.length>=minDates()?(state.dates.length<maxDates()?`Minimum reached. Add more dates for a steadier routine (up to ${maxDates()}).`:'All set: one teacher and one shared time for every date.'):`Select ${minDates()-state.dates.length} more date${minDates()-state.dates.length===1?'':'s'} to reach the minimum.`;
  $('duration-note').textContent=!p.care&&!p.group&&p.lessonMinutes<getLength()?`${p.lessonMinutes} minutes of focused learning, plus ${getLength()-p.lessonMinutes} minutes between lessons.`:p.care?`${state.hours} hour${state.hours>1?'s':''} of care each ${KIDDIE_CARE[state.care].night?'night':'day'}, starting at the same time.`:`Each ${p.group?'class':'lesson'} lasts ${getLength()} minutes. All selected dates use the same time slot.`;
  $('to-details').disabled=state.busy||state.dates.length<minDates()||!state.time||!state.common.includes(state.time);
}
function go(step){
  if(state.locked)return;clearError();state.step=step;
  for(let n=1;n<=3;n++)$('step-'+n).hidden=n!==step;
  document.querySelectorAll('.booking-steps li').forEach((li,i)=>{li.classList.toggle('done',i+1<step);if(i+1===step)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');li.querySelector('button').disabled=i+1>=step;});
  if(step===2){
    const p=getProgram();$('quick-select').hidden=monthly()||p.minSessions<5;
    $('step-2-intro').textContent=monthly()?`Choose your start date. We reserve the next ${minDates()} ${p.care?'school days (Mon–Fri, one month)':'class days'}, then choose the time.`:p.care?'Select one or more days of care, then choose a start time available on every day.':`Select at least ${p.minSessions} date${p.minSessions===1?'':'s'}, then choose a time available on every date.`;
    loadAvailability();
  }if(step===3)renderReview();$('step-'+step+'-title').focus();
}
function monthBounds(){const first=state.month+'-01';const [y,m]=state.month.split('-').map(Number);const last=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);return {first,last};}
async function loadAvailability(){
  const request=++state.request,key=[state.teacher,state.program,bookingBranch(),state.month,state.care,state.hours].join('|');state.busy=true;state.common=[];if(state.availKey!==key){state.availability={};state.availKey=key;}$('time-status').textContent='Checking shared availability…';
  // Skeletons while the server checks: shimmer the calendar on a fresh month, placeholder pills for the time slots.
  $('calendar').classList.toggle('is-loading',!Object.keys(state.availability).length);
  $('time-slots').replaceChildren(...(state.dates.length?Array.from({length:4},()=>node('span',undefined,'sk sk-pill')):[]));updateSummary();renderCalendar();
  try{
    const {first,last}=monthBounds();let data;
    if(state.preview){
      const dates={};for(let d=first;d<=last;d=addDays(d,1))dates[d]=slots(d);
      const chosen=state.dates.map(d=>slots(d));
      data={dates,common:chosen.length?chosen[0].filter(t=>chosen.every(s=>s.includes(t))):[]};
    }else{
      const params=new URLSearchParams({teacher:state.teacher,program:state.program,branch:bookingBranch(),month:state.month,dates:state.dates.join(','),care:state.care,hours:state.hours});
      data=await api('/api/availability?'+params);
    }
    if(request!==state.request)return;
    state.availability=data.dates;state.common=data.common;if(!state.common.includes(state.time))state.time='';
    $('time-status').textContent=state.dates.length?(state.common.length?'Available on all selected dates.':'No shared time is available. Remove a date or select different dates.'):'';
    renderTimes();
  }catch(error){if(request!==state.request)return;state.time='';$('time-slots').replaceChildren();$('time-status').textContent='Availability could not be verified.';showError(error.message);}
  finally{if(request===state.request){state.busy=false;$('calendar').classList.remove('is-loading');renderCalendar();updateSummary();}}
}
function renderCalendar(){
  const {first,last}=monthBounds();$('calendar-title').textContent=new Intl.DateTimeFormat('en-PH',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(first+'T12:00:00Z'));
  $('prev-month').disabled=state.month<=today.slice(0,7);$('next-month').disabled=state.month>=addDays(today,HORIZON_DAYS).slice(0,7);$('add-week').disabled=state.busy;
  const cells=[];const blanks=(weekday(first)+6)%7;for(let i=0;i<blanks;i++)cells.push(node('span'));
  for(let date=first;date<=last;date=addDays(date,1)){
    const d=date;const selected=state.dates.includes(d);const button=node('button',String(Number(d.slice(-2))),'date-cell'+(d===today?' today':''));button.type='button';button.dataset.date=d;button.setAttribute('aria-label',dateLabel(d)+(selected?', selected':''));button.setAttribute('aria-pressed',String(selected));button.disabled=!selected&&(!state.availability[d]?.length||state.dates.length>=maxDates());button.addEventListener('click',()=>toggleDate(d));cells.push(button);
  }
  $('calendar').replaceChildren(...cells);$('selected-dates').replaceChildren(...state.dates.map(d=>{const chip=node('span',undefined,'date-chip');chip.append(node('span',dateLabel(d,true)));const remove=node('button','×');remove.type='button';remove.setAttribute('aria-label','Remove '+dateLabel(d));remove.addEventListener('click',()=>toggleDate(d));chip.append(remove);return chip;}));
}
// Nursery enrollment and Kiddie Care monthly packages: one start date fills the next 20 class days (Kiddie Care: Mon–Fri).
function enrollmentDates(start){const out=[];for(let d=start;out.length<minDates()&&d<=addDays(today,HORIZON_DAYS);d=addDays(d,1))if(slots(d).length&&!(getProgram().care&&[0,6].includes(weekday(d))))out.push(d);return out;}
function toggleDate(date){
  if(monthly()){clearError();const days=enrollmentDates(date);if(days.length<minDates()){showError(`There are not ${minDates()} class days left from this start date. Choose an earlier start date.`);return;}state.dates=days;state.requestId=crypto.randomUUID();loadAvailability();return;}
  clearError();state.dates=state.dates.includes(date)?state.dates.filter(d=>d!==date):[...state.dates,date].sort();state.requestId=crypto.randomUUID();loadAvailability();}
function renderTimes(){
  $('time-help').textContent=state.dates.length?`${getProgram().care||getProgram().group?getLength():getProgram().lessonMinutes}-minute ${getProgram().group?'class':'lesson'}s. Choose one slot for all ${state.dates.length} selected dates.`:'Select your dates to see shared availability.';
  $('time-slots').replaceChildren(...state.common.map(t=>{const b=node('button',slotLabel(t,getLength()),'time-slot');b.type='button';b.dataset.time=t;b.setAttribute('aria-pressed',String(state.time===t));b.addEventListener('click',()=>{state.time=t;state.requestId=crypto.randomUUID();renderTimes();updateSummary();});return b;}));
}
async function addWeek(){
  if(state.busy)return;clearError();
  let start=state.dates.length?addDays(state.dates.at(-1),1):state.month+'-01';if(start<today)start=today;
  start=addDays(start,(8-weekday(start))%7);
  // Fills whole weeks up to the program minimum (4 weeks for 20 sessions); once met, each click adds one week.
  const limit=addDays(today,HORIZON_DAYS);let found=false;
  for(let tries=0;tries<27&&addDays(start,4)<=limit;tries++,start=addDays(start,7)){
    const week=Array.from({length:5},(_,i)=>addDays(start,i));
    if(week.every(d=>slots(d).length)){
      if(new Set([...state.dates,...week]).size>maxDates()){if(found)break;showError(`A booking can include up to ${maxDates()} sessions.`);return;}
      state.dates=[...new Set([...state.dates,...week])].sort();if(!found)state.month=start.slice(0,7);found=true;
      if(state.dates.length>=minDates())break;
    }
  }
  if(!found){showError('No full Monday–Friday week fits this teacher’s working schedule. Please choose dates individually.');return;}
  state.requestId=crypto.randomUUID();await loadAvailability();
}
function renderReview(){
  syncSubmit();
  $('review-sessions').replaceChildren(...sessionRows(state.dates.map(date=>({date})),state.time));
  const rate=sessionRate(state.program,branchById(state.branches,bookingBranch())),p=getProgram(),care=quote();
  $('total-price').textContent=totalLabel(care?care.total:rate==null?null:rate*state.dates.length);
  $('price-breakdown').textContent=care?care.summary:rate==null?`${state.dates.length} day${state.dates.length===1?'':'s'} · ${state.hours} h each · the center confirms the fee`:monthly()?`${minDates()} class days`:`${state.dates.length} sessions × ${peso(rate)} per session`;
  $('payment-instructions').textContent=state.paymentInstructions||'Scan the QR code in GCash, pay the total above, then upload your receipt below. You can also pay later at the branch.';
  $('fee-note').textContent=(p.price?p.price+'. ':'')+(p.care?KIDDIE_NOTES.join(' '):monthly()?`${p.name} covers ${p.minSessions} class days; renew with the center.`:p.minSessions>1?`${p.name} bookings need at least ${p.minSessions} sessions.`:'Book one or more sessions.')+(rate==null?'':' The total uses the per-session package rate.');
}
function sessionRows(sessions,time){return sessions.map(s=>{const row=node('div',undefined,'review-session');row.append(node('span',dateLabel(s.date)),node('span',slotLabel(time,getLength())));if(s.meetLink){const meet=node('a','Google Meet','meet-link');meet.href=s.meetLink;meet.target='_blank';meet.rel='noopener';row.append(meet);}return row;});}
const bookingBranch=()=>state.mode==='online'?'online':state.branch;
// Check files as soon as they are chosen: drop unusable ones and say why next to the field, so the parent can pick again.
function keepValidFiles(input,limit){
  const files=[...input.files],problems=[];
  const valid=files.filter(f=>{
    if(!ATTACHMENT_TYPES.includes(f.type)){problems.push(`${f.name} is not a JPG, PNG, WebP or PDF file.`);return false;}
    if(f.size>MAX_ATTACHMENT_BYTES){problems.push(`${f.name} is too big (${(f.size/1048576).toFixed(1)} MB). Please choose a file of 5 MB or less.`);return false;}
    return true;
  });
  if(valid.length>limit)problems.push(`Only the first ${limit===1?'file was':`${limit} files were`} kept.`);
  showFileNote(input,problems);
  if(problems.length){const kept=new DataTransfer();valid.slice(0,limit).forEach(f=>kept.items.add(f));input.files=kept.files;}
}
function showFileNote(input,problems){
  let note=input.parentElement.querySelector('.file-error');
  if(!note){note=node('small',undefined,'file-error');note.setAttribute('role','alert');input.after(note);}
  note.textContent=problems.join(' ');note.hidden=!problems.length;
}
// Homework files build up across picks (up to 3); each one can be removed before booking.
let requestFiles=[];
const fileKey=f=>`${f.name}|${f.size}|${f.lastModified}`;
const fileSize=bytes=>bytes<1048576?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/1048576).toFixed(1)} MB`;
function addRequestFiles(input){
  const problems=[];
  for(const f of input.files){
    if(!ATTACHMENT_TYPES.includes(f.type))problems.push(`${f.name} is not a JPG, PNG, WebP or PDF file.`);
    else if(f.size>MAX_ATTACHMENT_BYTES)problems.push(`${f.name} is too big (${(f.size/1048576).toFixed(1)} MB). Please choose a file of 5 MB or less.`);
    else if(requestFiles.some(x=>fileKey(x)===fileKey(f)))problems.push(`${f.name} is already attached.`);
    else if(requestFiles.length>=MAX_REQUEST_FILES)problems.push(`You can attach up to ${MAX_REQUEST_FILES} files. Remove one to add another.`);
    else requestFiles.push(f);
  }
  input.value='';showFileNote(input,[...new Set(problems)]);renderRequestFiles();
}
function renderRequestFiles(){
  const input=$('request-files'),full=requestFiles.length>=MAX_REQUEST_FILES;
  $('request-file-list').replaceChildren(...requestFiles.map(f=>{
    const item=node('li',undefined,'file-item'),remove=node('button','×','file-remove');remove.type='button';remove.setAttribute('aria-label',`Remove ${f.name}`);
    remove.addEventListener('click',()=>{requestFiles=requestFiles.filter(x=>x!==f);showFileNote(input,[]);renderRequestFiles();input.focus();});
    item.append(node('span',f.name,'file-name'),node('span',fileSize(f.size),'file-size'),remove);return item;
  }));
  input.disabled=full;$('request-file-count').textContent=requestFiles.length?`${requestFiles.length} of ${MAX_REQUEST_FILES} files attached${full?' · remove one to add another':''}`:'';
}
$('request-files').addEventListener('change',e=>addRequestFiles(e.target));
$('receipt-file').addEventListener('change',e=>keepValidFiles(e.target,1));
async function readAttachments(){
  const request=requestFiles,receipt=[...$('receipt-file').files];
  if(request.length>MAX_REQUEST_FILES)throw new Error(`Attach up to ${MAX_REQUEST_FILES} files.`);
  const all=[...request.map(file=>({file,kind:'request'})),...receipt.map(file=>({file,kind:'receipt'}))];
  for(const {file} of all){if(!ATTACHMENT_TYPES.includes(file.type))throw new Error(`${file.name} must be a JPG, PNG, WebP or PDF file.`);if(file.size>MAX_ATTACHMENT_BYTES)throw new Error(`${file.name} is larger than 5 MB.`);}
  return Promise.all(all.map(({file,kind})=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({kind,name:file.name,type:file.type,data:reader.result.split(',')[1]});reader.onerror=()=>reject(new Error(`${file.name} could not be read.`));reader.readAsDataURL(file);})));
}
function lockForm(lock){state.locked=lock;document.querySelectorAll('#booking-form input,#booking-form select,#booking-form textarea,#booking-form button').forEach(el=>el.disabled=lock);if(!lock){renderRequestFiles();syncSubmit();}}
function syncSubmit(){const f=$('booking-form').elements;$('submit-booking').disabled=state.locked||!f.consent.checked||!f.privacyConsent.checked;}
$('booking-form').addEventListener('input',()=>{if(!state.locked)state.requestId=crypto.randomUUID();});
$('booking-form').addEventListener('submit',async event=>{
  event.preventDefault();if(state.locked)return;clearError();if(state.dates.length<minDates()||!state.time){showError(`Select at least ${minDates()} date${minDates()===1?'':'s'} and one shared time.`);return;}
  let attachments;try{attachments=await readAttachments();}catch(error){showError(error.message);return;}
  const fields=Object.fromEntries(new FormData(event.target));const payload={...fields,consent:fields.consent==='on',privacyConsent:fields.privacyConsent==='on',teacher:state.teacher,program:state.program,branch:bookingBranch(),area:state.area,...(getProgram().care&&{care:state.care,needs:state.needs,plan:state.plan,tutorial:state.tutorial,hours:state.hours}),dates:state.dates,time:state.time,requestId:state.requestId,attachments};lockForm(true);$('submitting').showModal();$('submit-booking').textContent=state.preview?'Preparing preview…':'Checking dates and updating calendar…';
  try{
    let result;
    if(state.preview){const p=getProgram();const rate=sessionRate(p.id,branchById(state.branches,bookingBranch()));result={id:state.requestId,reference:'PREVIEW ONLY',preview:true,online:p.mode==='online',rate,total:quote()?.total??(rate==null?null:rate*state.dates.length),paid:attachments.some(a=>a.kind==='receipt'),programName:p.name,lessonMinutes:getLength(),teacherName:getTeacher().name,time:state.time,sessions:state.dates.map(date=>({date,start:instant(date,state.time).toISOString(),end:new Date(instant(date,state.time).getTime()+getLength()*60000).toISOString()}))};}
    else result=await api('/api/bookings',{method:'POST',body:JSON.stringify(payload)});
    state.confirmation=result;showConfirmation(result);
  }catch(error){
    const clash=error.data?.conflicts||[];
    // Name the dates that were just taken, so the parent knows what to change.
    if(clash.length)showError(`${error.message} Taken: ${clash.map(d=>dateLabel(d,true)).join(', ')}.`);
    else if(error.data?.reference)showError(error.message+' Reference: '+error.data.reference);else showError(error.message);
    if(clash.length){state.time='';updateSummary();}
  }finally{$('submitting').close();lockForm(false);$('submit-booking').textContent=state.preview?'Preview my sessions →':'Confirm sessions →';}
});
function showConfirmation(b){
  for(let i=1;i<=3;i++)$('step-'+i).hidden=true;
  document.querySelectorAll('.booking-steps li').forEach(li=>{li.classList.add('done');li.removeAttribute('aria-current');li.querySelector('button').disabled=true;});
  const panel=$('confirmation');panel.replaceChildren(node('div',b.preview?'✦':'✓','confirmation-icon'),node('h2',b.preview?'Your learning plan is ready to preview.':'Your sessions are booked.'),node('p',b.preview?'This preview has not reserved any sessions or updated Google Calendar.':b.sessions.length===1?'Your session was added to your teacher’s Google Calendar.':`All ${b.sessions.length} sessions were added to your teacher’s Google Calendar.`),node('p',b.reference,'reference'),node('p',`Total: ${totalLabel(b.total)} · ${b.paid?'Receipt received — the center will verify your payment.':'Not yet paid.'}`,'confirmation-total'),...(b.paid||b.preview?[]:[Object.assign(node('a','How to pay with GCash →','pay-link'),{href:'/payment',target:'_blank',rel:'noopener'})]),...(b.preview?[]:[node('p',b.online?'Your schedule and a Google Calendar invitation from KieAn, with one Google Meet link for every session, were sent to your email.':'Your full schedule has been sent to your email.')]));
  const review=node('div',undefined,'review-box');review.append(node('h3',b.teacherName),...sessionRows(b.sessions,b.time));panel.append(review);
  const actions=node('div',undefined,'panel-actions');const download=node('button',b.preview?'Download preview calendar':'Download my calendar','btn btn-orange');download.type='button';download.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([icsForBooking(b)],{type:'text/calendar;charset=utf-8'}));const a=node('a');a.href=url;a.download=b.preview?'kiean-preview.ics':`kiean-${b.reference}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);});const again=node('a','Start a new booking','btn btn-outline');again.href='/booking';actions.append(download,again);panel.append(actions,node('p',b.preview?'Live booking opens after the center connects its teachers and calendars.':'Save this reference and quote it whenever you contact the center about payment or changes.'));panel.hidden=false;panel.focus();
}
$('submitting').addEventListener('cancel',e=>e.preventDefault());
for(const name of ['consent','privacyConsent'])$('booking-form').elements[name].addEventListener('change',syncSubmit);
$('booking-form').elements.notes.addEventListener('input',e=>{$('notes-count').textContent=`${e.target.value.length} / 350`;});
$('mode').addEventListener('change',e=>{state.mode=e.target.value;state.teacher='';resetSchedule();renderPrograms();});
$('program').addEventListener('change',e=>{state.program=e.target.value;state.teacher='';resetSchedule();renderPrograms();});$('branch').addEventListener('change',e=>{state.branch=e.target.value;state.teacher='';resetSchedule();renderPrograms();});
for(const id of ['care','needs','plan','hours','tutorial'])$(id).addEventListener('change',e=>{state[id]=id==='hours'?Number(e.target.value):id==='tutorial'?e.target.checked:e.target.value;resetSchedule();renderPrograms();});
function fillAreas(region){
  const places=AREAS.filter(a=>a.region===region).sort((a,b)=>a.name.localeCompare(b.name));
  const first=node('option',!region?'Choose your province first':region==='none'?'—':'Choose your city or municipality');first.value='';
  $('area').replaceChildren(first,...places.map(a=>{const opt=node('option',a.name);opt.value=a.id;return opt;}));$('area').disabled=!places.length;
}
$('province').addEventListener('change',e=>{fillAreas(e.target.value);state.area=e.target.value==='none'?'none':'';state.teacher='';resetSchedule();renderPrograms();});
$('area').addEventListener('change',e=>{state.area=e.target.value;state.teacher='';resetSchedule();renderPrograms();});
$('locate').addEventListener('click',locate);
// Optional: find the parent's town from the browser location (they must allow it); manual choice always works.
async function locate(){
  const status=$('area-status');
  if(!navigator.geolocation){status.textContent='Location is not available in this browser. Please choose your area from the list.';return;}
  status.textContent='Finding your town…';$('locate').disabled=true;
  try{
    const pos=await new Promise((ok,fail)=>navigator.geolocation.getCurrentPosition(ok,fail,{timeout:10000,maximumAge:600000}));
    const url=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=${pos.coords.latitude.toFixed(4)}&lon=${pos.coords.longitude.toFixed(4)}`;
    const {address}=await fetch(url,{referrerPolicy:'strict-origin-when-cross-origin'}).then(r=>r.json());
    const area=matchArea(address);
    if(area){state.area=area.id;$('province').value=area.region;fillAreas(area.region);$('area').value=area.id;status.textContent=`We found ${area.name} (${area.region}). Change it if this is not right.`;state.teacher='';resetSchedule();renderPrograms();}
    else status.textContent='We could not match your location to a service area. Please choose it from the list.';
  }catch(error){status.textContent=error?.code===1?'Location permission was not given. Please choose your area from the list.':'Your location could not be found. Please choose your area from the list.';}
  finally{$('locate').disabled=false;}
}
// Finished steps are buttons that go back; later steps stay locked until reached.
document.querySelectorAll('.booking-steps button').forEach(b=>b.addEventListener('click',()=>{if(Number(b.dataset.step)<state.step)go(Number(b.dataset.step));}));
$('to-dates').addEventListener('click',()=>go(2));$('to-details').addEventListener('click',()=>go(3));document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.back))));
for(const [id,diff] of [['prev-month',-1],['next-month',1]])$(id).addEventListener('click',()=>{const [y,m]=state.month.split('-').map(Number);state.month=new Date(Date.UTC(y,m-1+diff,1)).toISOString().slice(0,7);loadAvailability();});
$('clear-dates').addEventListener('click',()=>{if(state.busy)return;state.dates=[];state.time='';state.requestId=crypto.randomUUID();loadAvailability();});$('add-week').addEventListener('click',addWeek);
init();
// "How booking details are used" opens the privacy notice as a popup (also for direct #privacy-details links).
const privacy=$('privacy-details');
function openPrivacy(event){event?.preventDefault();if(!privacy.open)privacy.showModal();}
document.querySelectorAll('a[href="#privacy-details"]').forEach(link=>link.addEventListener('click',openPrivacy));
privacy.querySelector('.popup-close').addEventListener('click',()=>privacy.close());
privacy.addEventListener('click',event=>{if(event.target===privacy)privacy.close();});
if(location.hash==='#privacy-details')openPrivacy();
