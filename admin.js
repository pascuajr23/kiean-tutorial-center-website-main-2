import {PROGRAMS,AREAS,PERIOD_TYPES,CARE_TYPES,PORTFOLIO_TEACHERS,setPrograms,scheduleSummary,slug} from './shared.mjs';

const $=selector=>document.querySelector(selector);
const list=$('#teacher-list'),form=$('#roster-form'),message=$('#admin-message');
// The roster is shown as an overview of cards; one teacher at a time opens in the editor.
let teachers=[],savedIds=new Set(),editing=null,dirty=false;
// Locations come from the server (managed in the Locations section below).
let locations=[],branchOptions=[{id:'online',name:'Online'}];
const setLocations=list=>{locations=list;branchOptions=[{id:'online',name:'Online'},...list.map(({id,name,available})=>({id,name:available===false?`${name} (disabled)`:name}))];};
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function node(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
function initials(name){return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'KT';}
function setMessage(text,kind='info') {message.textContent=text;message.dataset.kind=kind;message.hidden=false;}
async function request(url,options){
  const response=await fetch(url,{credentials:'same-origin',...options});
  if(response.status===401){location.assign('/admin');throw new Error('Your admin session has ended. Please sign in again.');}
  let data;try{data=await response.json();}catch{data={};}
  if(!response.ok)throw new Error(data.error||'Unable to update teacher settings.');
  return data;
}
function addField(parent,labelText,value,{type='text',field,readOnly=false,maxLength=160}={}){
  const label=node('label','admin-field');label.append(node('span','',labelText));
  const input=type==='textarea'?node('textarea'):node('input');
  if(type!=='textarea')input.type=type;
  input.value=value||'';input.dataset.field=field;input.maxLength=maxLength;input.readOnly=readOnly;
  label.append(input);parent.append(label);return input;
}
function addOptions(fieldset,legend,options,selected,group){
  fieldset.append(node('legend','selection-title',legend));
  const choices=node('div','choice-list');
  for(const option of options){
    const label=node('label','choice'),input=node('input');input.type='checkbox';input.value=option.id;input.checked=selected.includes(option.id);input.dataset.group=group;
    label.append(input,node('span','',option.name));choices.append(label);
  }
  fieldset.append(choices);
}
// Hour, minute (15-minute steps) and AM/PM as three short dropdowns; a hidden field keeps the HH:MM value the save reads.
// An older off-step minute (e.g. 9:10) stays selectable.
function timePick(value,field,label){
  const [h,m]=value.split(':').map(Number),wrap=node('span','time-pick'),hidden=node('input');hidden.type='hidden';hidden.dataset.timeField=field;
  const select=(name,items,current)=>{const el=node('select','time-part');el.setAttribute('aria-label',`${label} ${name}`);for(const [text,val] of items){const o=node('option','',text);o.value=val;el.append(o);}el.value=current;return el;};
  const pad=n=>String(n).padStart(2,'0');
  const hour=select('hour',Array.from({length:12},(_,i)=>[String(i+1),String(i+1)]),String(h%12||12));
  const minute=select('minute',[...new Set([0,15,30,45,m])].sort((x,y)=>x-y).map(n=>[pad(n),pad(n)]),pad(m));
  const half=select('AM or PM',[['AM','AM'],['PM','PM']],h<12?'AM':'PM');
  const sync=()=>{hidden.value=`${pad(Number(hour.value)%12+(half.value==='PM'?12:0))}:${minute.value}`;};
  for(const el of [hour,minute,half])el.addEventListener('change',sync);sync();
  wrap.append(hour,node('span','time-colon',':'),minute,half,hidden);return wrap;
}
function makeTimeRange(list,range={},day='day'){
  const row=node('div','time-range'),start=timePick(range[0]||'09:00','start',`${day} from`),end=timePick(range[1]||'17:00','end',`${day} until`),remove=node('button','remove-period','×');
  remove.type='button';remove.setAttribute('aria-label','Remove availability period');remove.addEventListener('click',()=>row.remove());
  const type=node('select','period-type');type.dataset.timeField='type';type.setAttribute('aria-label',`${day} period is for`);
  for(const option of PERIOD_TYPES){const item=node('option','',option.label);item.value=option.id;type.append(item);}
  type.value=range[2]||'any';
  // Class periods (Playgroup, Nursery, Kiddie Care) take several learners: ask how many.
  const seats=node('label','period-seats'),seatInput=node('input');seatInput.type='number';seatInput.min='1';seatInput.max='20';seatInput.value=range[3]||4;seatInput.dataset.timeField='seats';seatInput.setAttribute('aria-label',`${day} class size`);
  seats.append(node('span','','Class size'),seatInput);
  const showSeats=()=>{const group=PERIOD_TYPES.find(p=>p.id===type.value)?.group;seats.hidden=!group;seatInput.required=Boolean(group);};
  type.addEventListener('change',showSeats);showSeats();
  row.append(start,node('span','range-separator','to'),end,remove,type,seats);list.append(row);
}
function makeTeacherCard(teacher){
  const card=node('article','teacher-card');card.dataset.teacherId=teacher.id;
  const head=node('div','teacher-card-head'),identity=node('div','teacher-identity');
  identity.append(node('span','teacher-initials',initials(teacher.name)));identity.lastChild.setAttribute('aria-hidden','true');
  const title=node('div','teacher-title');title.append(node('h2','',teacher.name||'New teacher'),node('code','teacher-id',teacher.id));identity.append(title);head.append(identity);
  if(!savedIds.has(teacher.id)){
    const remove=node('button','draft-remove','Remove draft');remove.type='button';remove.addEventListener('click',()=>{teachers=teachers.filter(item=>item.id!==teacher.id);editing=null;dirty=false;render();setMessage('Draft removed.');});head.append(remove);
  }else if(teacher.available===false){
    const remove=node('button','draft-remove','Delete teacher');remove.type='button';remove.addEventListener('click',()=>deleteTeacher(teacher));head.append(remove);
  }
  const availability=node('label','availability-switch'),toggle=node('input');toggle.type='checkbox';toggle.checked=teacher.available!==false;toggle.dataset.field='available';
  availability.append(toggle,node('span','','Accepting bookings'));head.append(availability);card.append(head);
  const body=node('div','teacher-card-body'),fields=node('div','teacher-fields');
  addField(fields,'Teacher name',teacher.name,{field:'name',maxLength:100});
  const email=addField(fields,'Google account email',teacher.googleEmail,{field:'googleEmail',type:'email',readOnly:Boolean(teacher.googleConnected),maxLength:200});
  email.autocomplete='email';
  const bio=addField(fields,'Short introduction',teacher.bio,{field:'bio',type:'textarea',maxLength:350});fields.lastElementChild.classList.add('admin-field-bio');
  // Grows with the text so the whole introduction stays visible.
  const fitBio=()=>{bio.style.height='auto';bio.style.height=bio.scrollHeight+2+'px';};bio.rows=2;bio.addEventListener('input',fitBio);requestAnimationFrame(fitBio);
  body.append(fields);
  const groups=node('div','selection-groups'),programs=node('fieldset','selection-group'),branches=node('fieldset','selection-group');
  addOptions(programs,'Programs',PROGRAMS.filter(p=>p.mode).map(p=>({id:p.id,name:p.available===false?`${p.name} (disabled)`:p.name})),teacher.programs||[],'programs');
  addOptions(branches,'Branches',branchOptions,teacher.branches||[],'branches');groups.append(programs,branches);body.append(groups);
  // Parents only see a program at branches that offer it (portfolio pp. 27–34).
  const offered=id=>locations.filter(b=>b.programs.includes(id)).map(b=>b.name).join(', ')||'no location yet';
  body.append(node('p','selection-hint',PROGRAMS.filter(p=>p.mode==='branch'&&(p.group||p.id==='sped')).map(p=>`${p.name}: ${offered(p.id)}`).join(' · ')+'. Class programs also need a matching class period in Weekly hours. Online teachers are shown only to families in the areas of their branches, so tick at least one branch.'));
  const schedule=node('fieldset','weekly-group');schedule.append(node('legend','selection-title','Weekly hours · Philippine Time'));
  const weeklyGrid=node('div','weekly-grid');
  // Monday first; the weekend sits below the work week.
  [1,2,3,4,5,6,0].forEach(index=>{
    const day=weekdays[index],dayKey=String(index),ranges=teacher.weekly?.[dayKey]||[],row=node('div','weekday-row'+(index===6?' weekend-start':''));row.dataset.weekday=dayKey;
    const dayLabel=node('label','weekday-toggle'),dayToggle=node('input');dayToggle.type='checkbox';dayToggle.checked=ranges.length>0;dayToggle.dataset.dayToggle='true';dayLabel.append(dayToggle,node('span','',day));
    const rangeList=node('div','day-ranges');for(const range of ranges)makeTimeRange(rangeList,range,day);
    const addPeriod=node('button','add-period','Add hours');addPeriod.type='button';addPeriod.disabled=!dayToggle.checked;addPeriod.addEventListener('click',()=>makeTimeRange(rangeList,{},day));
    dayToggle.addEventListener('change',()=>{addPeriod.disabled=!dayToggle.checked;rangeList.querySelectorAll('input,button,select').forEach(control=>{control.disabled=!dayToggle.checked;});});
    const controls=node('div','weekday-controls');controls.append(rangeList,addPeriod);row.append(dayLabel,controls);weeklyGrid.append(row);
  });
  schedule.append(weeklyGrid);body.append(schedule);
  const connection=node('div','teacher-connection'),connectionState=node('span','connection-state',teacher.googleConnected?'Google Calendar connected':'Google Calendar not connected');
  connectionState.dataset.connected=String(Boolean(teacher.googleConnected));connectionState.prepend(node('span','connection-dot'));connection.append(connectionState);
  const connect=node('a','connection-link',teacher.googleConnected?'Reconnect Google Calendar':'Connect Google Calendar');
  connect.href=`/api/teachers/${encodeURIComponent(teacher.id)}/google/connect`;connect.target='_blank';connect.rel='noopener noreferrer';
  if(!teacher.googleEmail||!savedIds.has(teacher.id)){connect.setAttribute('aria-disabled','true');connect.tabIndex=-1;connect.addEventListener('click',event=>event.preventDefault());}
  connection.append(connect);body.append(connection);card.append(body);return card;
}
function makeSummaryCard(teacher){
  const card=node('button','teacher-summary');card.type='button';card.dataset.teacherId=teacher.id;
  const head=node('div','summary-head');head.append(node('span','teacher-initials',initials(teacher.name)));
  const title=node('div','summary-title');title.append(node('strong','',teacher.name||'New teacher'));
  const tags=node('div','summary-tags');
  const tag=(text,kind)=>{const t=node('span','summary-tag',text);t.dataset.kind=kind;tags.append(t);};
  if(!savedIds.has(teacher.id))tag('Draft · not saved','draft');
  if(/@example\.com$/i.test(teacher.googleEmail||''))tag('Needs real email','warn');
  tag(teacher.available!==false?'Accepting bookings':'Paused',teacher.available!==false?'on':'off');
  tag(teacher.googleConnected?'Calendar connected':'Calendar not connected',teacher.googleConnected?'on':'warn');
  title.append(tags);head.append(title);card.append(head);
  const programNames=(teacher.programs||[]).map(id=>PROGRAMS.find(p=>p.id===id)?.name).filter(Boolean);
  const branchNames=(teacher.branches||[]).map(id=>branchOptions.find(b=>b.id===id)?.name).filter(Boolean);
  const meta=node('dl','summary-meta');
  for(const [label,value] of [['Programs',programNames.join(', ')||'None'],['Branches',branchNames.join(', ')||'None']]){const row=node('div');row.append(node('dt','',label),node('dd','',value));meta.append(row);}
  card.append(meta);
  const {lines,hours}=scheduleSummary(teacher.weekly);
  const sched=node('div','summary-schedule');sched.append(node('span','summary-label',`Weekly hours${hours?` · ${hours} h`:''}`));
  if(lines.length)for(const line of lines)sched.append(node('span','summary-line',line));else sched.append(node('span','summary-line summary-empty','No hours set'));
  card.append(sched,node('span','summary-open','Edit schedule →'));
  card.addEventListener('click',()=>openEditor(teacher.id));
  return card;
}
// Enabled items first; disabled ones (not accepting bookings) in their own section below. Used for teachers, programs and locations.
function sections(items,makeCard,empty){
  const open=items.filter(x=>x.available!==false),paused=items.filter(x=>x.available===false);
  const group=(title,list,emptyText)=>{
    const section=node('section','teacher-group'),grid=node('div','teacher-group-grid');
    section.append(node('h2','teacher-group-title',`${title} · ${list.length}`));
    if(list.length)grid.append(...list.map(makeCard));else grid.append(node('p','teacher-group-empty',emptyText));
    section.append(grid);return section;
  };
  return [group('Accepting bookings',open,empty),...(paused.length?[group('Disabled · not accepting bookings',paused)]:[])];
}
const overviewGroups=()=>sections(teachers,makeSummaryCard,'No teacher is accepting bookings yet.');
function render(){
  const editor=editing!==null;
  list.classList.toggle('teacher-overview',!editor);
  list.replaceChildren(...(editor?[makeTeacherCard(teachers.find(t=>t.id===editing))]:overviewGroups()));
  $('#back-to-list').hidden=!editor;$('#save-roster').hidden=!editor;$('#add-teacher').hidden=editor;
  const missing=PORTFOLIO_TEACHERS.filter(p=>!teachers.some(t=>t.id===p.id));$('#add-portfolio').hidden=editor||!missing.length;$('#add-portfolio').textContent=`Add ${missing.length} portfolio teacher${missing.length===1?'':'s'}`;
  $('#teacher-count').textContent=String(teachers.filter(t=>savedIds.has(t.id)).length);
  $('#bookable-count').textContent=String(teachers.filter(teacher=>teacher.available!==false&&teacher.googleConnected).length);
  form.hidden=false;dirty=false;
}
function openEditor(id){editing=id;render();window.scrollTo({top:list.offsetTop-120,behavior:'smooth'});list.querySelector('[data-field="name"]')?.focus({preventScroll:true});setMessage('Editing '+(teachers.find(t=>t.id===id)?.name||'teacher')+'. Save to keep changes.');}
function backToList(){
  if(dirty&&!confirm('Discard unsaved changes to this teacher?'))return;
  if(editing!==null&&!savedIds.has(editing))teachers=teachers.filter(t=>t.id!==editing);
  editing=null;render();setMessage('All teachers.');
}
function readForm(){
  // Merge the open editor's values into the full roster; the server saves the whole roster.
  const edited=new Map([...list.querySelectorAll('.teacher-card')].map(card=>{
    const current=teachers.find(teacher=>teacher.id===card.dataset.teacherId);
    const value=field=>card.querySelector(`[data-field="${field}"]`);
    const selected=group=>[...card.querySelectorAll(`[data-group="${group}"]:checked`)].map(input=>input.value);
    const weekly={};
    for(const row of card.querySelectorAll('.weekday-row')){
      if(!row.querySelector('[data-day-toggle]').checked)continue;
      const ranges=[...row.querySelectorAll('.time-range')].map(range=>{const field=name=>range.querySelector(`[data-time-field="${name}"]`).value,type=field('type');return type==='any'?[field('start'),field('end')]:PERIOD_TYPES.find(p=>p.id===type)?.group?[field('start'),field('end'),type,Number(field('seats'))]:[field('start'),field('end'),type];});
      if(ranges.length)weekly[row.dataset.weekday]=ranges;
    }
    return [current.id,{...current,name:value('name').value.trim(),googleEmail:value('googleEmail').value.trim().toLowerCase(),bio:value('bio').value.trim(),available:value('available').checked,programs:selected('programs'),branches:selected('branches'),weekly}];
  }));
  return teachers.map(teacher=>edited.get(teacher.id)||teacher);
}
function showCenter(center){
  const state=$('#center-state'),link=$('#center-connect');if(!center)return;
  state.dataset.connected=String(center.connected);
  state.replaceChildren(node('span','connection-dot'),node('span','',!center.email?'Set centerEmail in config.json first':center.connected?`Connected as ${center.email}`:`Not connected · sign in as ${center.email}`));
  link.textContent=center.connected?'Reconnect':'Connect';link.hidden=!center.email;
}
async function load(){
  setMessage('Loading teacher roster…');
  try{const data=await request('/api/admin/teachers');showCenter(data.center);if(data.programs)setPrograms(data.programs);galleries=data.galleries||null;if(GALLERY[view])openGalleryEditor(view);renderPrograms();setLocations(data.branches);renderLocations();teachers=data.teachers;savedIds=new Set(teachers.map(teacher=>teacher.id));render();message.hidden=true;}
  catch(error){setMessage(error.message==='fetch failed'?'Could not reach the booking server.':error.message,'error');form.hidden=true;}
}
async function refreshConnections(){
  try{
    const data=await request('/api/admin/teachers');showCenter(data.center);
    const statuses=new Map(data.teachers.map(teacher=>[teacher.id,teacher.googleConnected]));
    if(editing===null){teachers=teachers.map(teacher=>({...teacher,googleConnected:Boolean(statuses.get(teacher.id))}));render();return;}
    for(const card of list.querySelectorAll('.teacher-card')){
      const connected=Boolean(statuses.get(card.dataset.teacherId)),state=card.querySelector('.connection-state'),link=card.querySelector('.connection-link'),email=card.querySelector('[data-field="googleEmail"]');
      state.dataset.connected=String(connected);state.replaceChildren(node('span','connection-dot'),node('span','',connected?'Google Calendar connected':'Google Calendar not connected'));
      link.textContent=connected?'Reconnect Google Calendar':'Connect Google Calendar';email.readOnly=connected;
      if(!email.value.trim()||!savedIds.has(card.dataset.teacherId)){link.setAttribute('aria-disabled','true');link.tabIndex=-1;}else{link.removeAttribute('aria-disabled');link.removeAttribute('tabindex');}
    }
    teachers=teachers.map(teacher=>({...teacher,googleConnected:Boolean(statuses.get(teacher.id))}));
    $('#bookable-count').textContent=String(teachers.filter(teacher=>teacher.available!==false&&teacher.googleConnected).length);
  }catch{}
}
$('#add-teacher').addEventListener('click',()=>{
  const id=`teacher-${crypto.randomUUID().slice(0,8)}`;
  teachers.push({id,name:'New teacher',bio:'',googleEmail:'',available:false,programs:['online'],branches:['online'],weekly:{},blackoutDates:[]});
  openEditor(id);setMessage('New teacher draft. Fill in the details, then save.');
});
$('#back-to-list').addEventListener('click',backToList);
list.addEventListener('input',()=>{dirty=true;});
list.addEventListener('click',event=>{if(event.target.closest('.remove-period,.add-period'))dirty=true;});
window.addEventListener('beforeunload',event=>{if(dirty)event.preventDefault();});
form.addEventListener('submit',async event=>{
  event.preventDefault();const button=$('#save-roster');button.disabled=true;setMessage('Saving teacher roster…');
  try{const data=await request('/api/admin/teachers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teachers:readForm()})});const name=readForm().find(t=>t.id===editing)?.name;teachers=data.teachers;savedIds=new Set(teachers.map(teacher=>teacher.id));editing=null;render();setMessage(`${name||'Teacher'} saved.`,'success');window.scrollTo({top:0,behavior:'smooth'});}
  catch(error){setMessage(error.message,'error');}
  finally{button.disabled=false;}
});
load();
window.addEventListener('focus',refreshConnections);

// ---- Locations: branches on the website, their programs, service areas and photos ----
const REGIONS=[...new Set(AREAS.map(a=>a.region))];
const editor=$('#location-editor'),locForm=$('#location-form');
// Enter in a text field must not submit: only the Save buttons save.
for(const f of [form,locForm,$('#program-form')])f.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=file])'))event.preventDefault();});
let editingLocation=null,draftPhotos=[];
function locationCard(b){
  const card=node('button','teacher-summary location-summary');card.type='button';
  const head=node('div','summary-head'),title=node('div','summary-title'),tags=node('div','summary-tags');
  const tag=(text,kind)=>{const t=node('span','summary-tag',text);t.dataset.kind=kind;tags.append(t);};
  tag(b.available!==false?'Accepting bookings':'Disabled',b.available!==false?'on':'off');tag(`${b.photos.length} photo${b.photos.length===1?'':'s'}`,'off');
  title.append(node('strong','',b.name),tags);head.append(title);card.append(head,node('p','location-address',b.address||'No address yet'));
  const meta=node('dl','summary-meta');
  for(const [label,value] of [['Programs',b.programs.map(id=>PROGRAMS.find(p=>p.id===id)?.name).join(', ')],['Serves',`${b.areas.length} cities and areas`]]){const row=node('div');row.append(node('dt','',label),node('dd','',value));meta.append(row);}
  card.append(meta,node('span','summary-open','Edit location →'));card.addEventListener('click',()=>openLocation(b));return card;
}
function renderLocations(){$('#location-list').replaceChildren(...sections(locations,locationCard,'No location is accepting bookings.'));}
function checkbox(name,value,label,checked){const wrap=node('label','choice'),input=node('input');input.type='checkbox';input.name=name;input.value=value;input.checked=checked;wrap.append(input,node('span','',label));return wrap;}
function renderPhotos(){
  $('#location-photos').replaceChildren(...draftPhotos.map(src=>{
    const item=node('li','photo-item'),img=node('img');img.src='/'+src;img.alt='';img.loading='lazy';
    const remove=node('button','file-remove','×');remove.type='button';remove.setAttribute('aria-label','Remove photo');
    remove.addEventListener('click',()=>{draftPhotos=draftPhotos.filter(p=>p!==src);renderPhotos();});item.append(img,remove);return item;
  }));
}
function openLocation(branch){
  editingLocation=branch?.id||null;draftPhotos=[...(branch?.photos||[])];
  $('#location-editor-title').textContent=branch?branch.name:'New location';
  locForm.elements.name.value=branch?.name||'';locForm.elements.address.value=branch?.address||'';locForm.elements.available.checked=branch?branch.available!==false:true;
  $('#location-programs').replaceChildren(...PROGRAMS.filter(p=>p.mode==='branch').map(p=>checkbox('programs',p.id,p.available===false?`${p.name} (disabled)`:p.name,Boolean(branch?.programs.includes(p.id)))));
  $('#location-areas').replaceChildren(...REGIONS.map(region=>{
    const group=node('fieldset','area-group'),places=AREAS.filter(a=>a.region===region);
    const all=checkbox('','', `${region==='Other Luzon'?'Other provinces':region} — select all`,places.every(a=>branch?.areas.includes(a.id)));all.classList.add('select-all');
    const list=node('div','choice-list');list.append(...places.map(a=>checkbox('areas',a.id,a.name,Boolean(branch?.areas.includes(a.id)))));
    all.querySelector('input').addEventListener('change',e=>list.querySelectorAll('input').forEach(i=>{i.checked=e.target.checked;}));
    group.append(node('legend','',region==='Other Luzon'?'Other provinces':region),all,list);return group;
  }));
  renderPhotos();$('#photo-status').textContent='';
  const off=branch?.available===false;$('#delete-location').hidden=!off;$('#location-delete-hint').hidden=!branch||off;editor.showModal();locForm.elements.name.focus();
}
$('#add-location').addEventListener('click',()=>openLocation(null));
editor.querySelector('.popup-close').addEventListener('click',()=>editor.close());
$('#location-photo-input').addEventListener('change',async e=>{
  const files=[...e.target.files];e.target.value='';const status=$('#photo-status');
  for(const file of files){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){status.textContent=`${file.name} is not a JPG, PNG or WebP image.`;continue;}
    if(file.size>5*1024*1024){status.textContent=`${file.name} is larger than 5 MB.`;continue;}
    if(draftPhotos.length>=12){status.textContent='A location can have up to 12 photos.';break;}
    status.textContent=`Uploading ${file.name}…`;
    try{
      const data=await new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(r.result.split(',')[1]);r.onerror=fail;r.readAsDataURL(file);});
      const {path}=await request('/api/admin/branch-photos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:file.type,data})});
      draftPhotos.push(path);renderPhotos();status.textContent='Photo added. Save the location to keep it.';
    }catch(error){status.textContent=error.message;}
  }
});
async function saveLocations(next,message,remove){
  try{const data=await request('/api/admin/branches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({branches:next,remove})});setLocations(data.branches);renderLocations();if(editing===null)render();editor.close();setMessage(message,'success');}
  catch(error){$('#photo-status').textContent=error.message;}
}
locForm.addEventListener('submit',event=>{
  event.preventDefault();
  const name=locForm.elements.name.value.trim(),current=locations.find(b=>b.id===editingLocation);
  let id=current?.id;if(!id){id=slug(name)||'location';for(let n=2;locations.some(b=>b.id===id);n++)id=`${slug(name)}-${n}`;}
  const checked=group=>[...locForm.querySelectorAll(`input[name="${group}"]:checked`)].map(i=>i.value);
  const branch={...current,id,name,address:locForm.elements.address.value.trim(),available:locForm.elements.available.checked,programs:checked('programs'),areas:checked('areas'),photos:draftPhotos};
  const next=current?locations.map(b=>b.id===id?branch:b):[...locations,branch];
  saveLocations(next,`${name} saved. The website, booking page and teacher options now use it.`);
});
$('#delete-location').addEventListener('click',async()=>{
  const current=locations.find(b=>b.id===editingLocation);if(current?.available!==false)return;
  const typed=await confirmDelete('location',current.name,'Its address, photos and service areas are removed from the website. Move its teachers to another location first.');
  if(typed)saveLocations(locations.filter(b=>b.id!==current.id),`${current.name} deleted.`,{id:current.id,name:typed});
});
// ---- Homepage photo galleries: Permits and Feedback (testimonials) ----
const GALLERY={permits:{key:'permits',title:'Permits',intro:'Permit and registration photos in the homepage Permits section, in this order. Each needs a caption.',captions:true},feedback:{key:'testimonials',title:'Feedback',intro:'Parent feedback screenshots in the homepage Testimonials section, in this order.'}};
let galleries=null,galleryKind=null,galleryDraft=[],galleryDirty=false;
function openGalleryEditor(kind){
  const g=GALLERY[kind];galleryKind=kind;$('#gallery-title').textContent=g.title;$('#gallery-intro').textContent=g.intro;$('#gallery-status').textContent='';
  if(!galleries){$('#gallery-list').replaceChildren(node('li','teacher-group-empty','Loading photos…'));return;}
  if(!galleryDirty)galleryDraft=structuredClone(galleries[g.key]);
  renderGallery();
}
function renderGallery(){
  const g=GALLERY[galleryKind];
  $('#gallery-list').replaceChildren(...galleryDraft.map((item,i)=>{
    const li=node('li','gallery-admin-item'),img=node('img');img.src='/'+(item.thumb||item.src);img.alt='';img.loading='lazy';
    const fields=node('div','gallery-admin-fields');
    const field=(label,key,max)=>{const wrap=node('label','admin-field'),input=node('input');input.value=item[key]||'';input.maxLength=max;input.addEventListener('input',()=>{item[key]=input.value;galleryDirty=true;});wrap.append(node('span','',label),input);return wrap;};
    if(g.captions)fields.append(field('Caption','caption',120));
    fields.append(field('Description (for screen readers)','alt',200));
    const tools=node('div','program-order');
    for(const [text,step,label] of [['↑',-1,'earlier'],['↓',1,'later'],['×',0,'Remove']]){
      const b=node('button','button button-secondary',text);b.type='button';
      b.setAttribute('aria-label',step?`Move photo ${i+1} ${label}`:`Remove photo ${i+1}`);b.disabled=step!==0&&!galleryDraft[i+step];
      b.addEventListener('click',()=>{if(step)[galleryDraft[i],galleryDraft[i+step]]=[galleryDraft[i+step],galleryDraft[i]];else galleryDraft.splice(i,1);galleryDirty=true;renderGallery();$('#gallery-status').textContent='Not saved yet.';});
      tools.append(b);
    }
    li.append(img,fields,tools);return li;
  }));
  if(!galleryDraft.length)$('#gallery-list').append(node('li','teacher-group-empty','No photos yet. The homepage keeps its built-in photos until you add some.'));
}
$('#gallery-add').addEventListener('click',()=>$('#gallery-input').click());
$('#gallery-input').addEventListener('change',async e=>{
  const files=[...e.target.files];e.target.value='';const status=$('#gallery-status');
  for(const file of files){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){status.textContent=`${file.name} is not a JPG, PNG or WebP image.`;continue;}
    if(file.size>5*1024*1024){status.textContent=`${file.name} is larger than 5 MB.`;continue;}
    if(galleryDraft.length>=30){status.textContent='Up to 30 photos.';break;}
    status.textContent=`Uploading ${file.name}…`;
    try{
      const data=await new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(r.result.split(',')[1]);r.onerror=fail;r.readAsDataURL(file);});
      const {path}=await request('/api/admin/branch-photos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:file.type,data})});
      galleryDraft.push({src:path,alt:'',...(GALLERY[galleryKind].captions?{caption:''}:{})});galleryDirty=true;renderGallery();status.textContent='Photo added. Save to show it on the homepage.';
    }catch(error){status.textContent=error.message;}
  }
});
$('#save-gallery').addEventListener('click',async()=>{
  const g=GALLERY[galleryKind],button=$('#save-gallery');
  if(g.captions&&galleryDraft.some(item=>!item.caption?.trim())){$('#gallery-status').textContent='Add a caption to every permit photo.';return;}
  button.disabled=true;$('#gallery-status').textContent='Saving…';
  try{
    const data=await request('/api/admin/galleries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({galleries:{...galleries,[g.key]:galleryDraft}})});
    galleries=data.galleries;galleryDirty=false;galleryDraft=structuredClone(galleries[g.key]);renderGallery();$('#gallery-status').textContent='';setMessage(`${g.title} photos saved. The homepage now shows them.`,'success');
  }catch(error){$('#gallery-status').textContent=error.message;}
  finally{button.disabled=false;}
});
window.addEventListener('beforeunload',event=>{if(galleryDirty)event.preventDefault();});
// Home shows big choices; #teachers, #programs and #locations are separate screens.
let view='';
function route(){
  const next=['teachers','programs','locations','permits','feedback'].includes(location.hash.slice(1))?location.hash.slice(1):'';
  if(galleryDirty&&galleryKind&&next!==galleryKind){if(!confirm('Discard unsaved photo changes?')){location.hash=galleryKind;return;}galleryDirty=false;}
  if(view==='teachers'&&next!=='teachers'&&editing!==null){
    if(dirty&&!confirm('Discard unsaved changes to this teacher?')){location.hash='teachers';return;}
    dirty=false;backToList();
  }
  view=next;
  const screen=GALLERY[next]?'gallery':next||'home';
  for(const id of ['home','teachers','programs','locations','gallery'])$(`#view-${id}`).hidden=id!==screen;
  galleryKind=null;if(GALLERY[next])openGalleryEditor(next);
  if(message.dataset.kind!=='error')message.hidden=true;
  window.scrollTo(0,0);
}
window.addEventListener('hashchange',route);route();

// ---- Programs: homepage cards, bookable programs and their prices (Kiddie Care has its own rate table) ----
const progEditor=$('#program-editor'),progForm=$('#program-form');
let editingProgram=null;
const kindOf=p=>!p.mode?'info':p.group?'class':'tutorial';
const KIND_TEXT={online:'Online tutorial (built in) · booked through Google Meet',care:'Kiddie Care (built in) · priced by the rate table below',tutorial:'Face-to-face tutorial',class:'Group class · needs a matching class period in each teacher’s Weekly hours',info:'Homepage card only · not bookable'};
const kindText=p=>KIND_TEXT[p.mode==='online'?'online':p.care?'care':kindOf(p)];
function programCard(p){
  const item=node('div','program-item'),card=node('button','teacher-summary location-summary');card.type='button';
  const head=node('div','summary-head'),title=node('div','summary-title'),tags=node('div','summary-tags');
  const tag=(text,kind)=>{const t=node('span','summary-tag',text);t.dataset.kind=kind;tags.append(t);};
  if(p.available===false)tag('Disabled','off');else if(p.mode)tag('Accepting bookings','on');else tag('Homepage only','off');
  if(p.homepage===false&&p.available!==false)tag('Hidden from homepage','off');
  title.append(node('strong','',`${p.icon?p.icon+' ':''}${p.name}`),tags);head.append(title);card.append(head,node('p','location-address',p.price||'No price text yet'));
  const meta=node('dl','summary-meta'),rows=[['Type',kindText(p)]];
  if(p.mode&&!p.care)rows.push(['Booking',`${p.maxSessions===p.minSessions?`${p.minSessions} class days`:`${p.minSessions}+ sessions`} · ${p.rate==null?'center confirms fee':`₱${p.rate.toLocaleString('en-PH')} / session`} · ${p.lessonMinutes} min`]);
  if(!p.mode)rows.push(['Button',p.link?`Books ${PROGRAMS.find(x=>x.id===p.link)?.name||p.link}`:'Inquire on Facebook']);
  for(const [label,value] of rows){const row=node('div');row.append(node('dt','',label),node('dd','',value));meta.append(row);}
  card.append(meta,node('span','summary-open','Edit program →'));card.addEventListener('click',()=>openProgram(p));
  // Homepage order: move past the neighbouring program in the same section.
  const peers=PROGRAMS.filter(x=>(x.available!==false)===(p.available!==false)),at=peers.indexOf(p),order=node('div','program-order');
  for(const [text,step,label] of [['↑',-1,'earlier'],['↓',1,'later']]){
    const other=peers[at+step],b=node('button','button button-secondary',text);b.type='button';b.setAttribute('aria-label',`Move ${p.name} ${label} on the homepage`);b.disabled=!other;
    b.dataset.move=`${p.id}:${step}`;b.addEventListener('click',()=>moveProgram(p.id,other?.id,step));order.append(b);
  }
  item.append(card,order);return item;
}
function renderPrograms(){$('#program-list').replaceChildren(...sections(PROGRAMS,programCard,'No program is enabled.'));}
function careGrid(rates={}){
  const input=(path,value,label,max=100000)=>{const i=node('input');i.type='number';i.min=1;i.max=max;i.step=1;i.dataset.care=path;i.value=value??'';i.setAttribute('aria-label',label);return i;};
  const table=(caption,cols,rows)=>{
    const t=node('table','care-grid');t.append(node('caption','',caption));
    const head=node('tr');head.append(node('th'),...cols.map(c=>{const th=node('th','',c);th.scope='col';return th;}));t.append(head);
    for(const [label,cells] of rows){const tr=node('tr'),th=node('th','',label);th.scope='row';tr.append(th,...cells.map(c=>{const td=node('td');td.append(c);return td;}));t.append(tr);}
    return t;
  };
  const tables=['day','night'].map(id=>{const type=CARE_TYPES[id],r=rates[id]||{};
    return table(type.label,[`Regular / ${type.unit}`,`Special / ${type.unit}`,'Regular / month','Special / month'],type.hourOptions.map(h=>[`${h} hours`,[['rates','regular'],['rates','special'],['monthly','regular'],['monthly','special']].map(([k,n])=>input(`${id}.${k}.${n}.${h}`,r[k]?.[n]?.[h],`${type.label}, ${h} hours, ${n}, ${k==='monthly'?'per month':'per '+type.unit}`))]));});
  const walk=id=>{const r=rates[id]||{},night=CARE_TYPES[id].night;return [night?'Night':'Daytime',[input(`${id}.perHour.regular`,r.perHour?.regular,`Walk-in ${night?'night':'daytime'}, regular, per hour`),input(`${id}.perHour.special`,r.perHour?.special,`Walk-in ${night?'night':'daytime'}, special, per hour`),input(`${id}.maxHours`,r.maxHours??(night?12:8),`Walk-in ${night?'night':'daytime'}, maximum hours`,24)]];};
  const tut=rates.day?.tutorial||{};
  tables.push(table('Walk-in, per hour',['Regular / hour','Special / hour','Max hours'],[walk('walk-in-day'),walk('walk-in-night')]),
    table('Tutorial add-on (day stay)',['Regular','Special'],[['Per day',['regular','special'].map(n=>input(`day.tutorial.day.${n}`,tut.day?.[n],`Tutorial per day, ${n}`))],['Per month',['regular','special'].map(n=>input(`day.tutorial.month.${n}`,tut.month?.[n],`Tutorial per month, ${n}`))]]));
  $('#care-rates').replaceChildren(...tables);
}
function readCare(){
  const out={};
  for(const i of $('#care-rates').querySelectorAll('[data-care]')){if(i.value==='')continue;const keys=i.dataset.care.split('.');let o=out;for(const k of keys.slice(0,-1))o=o[k]??={};o[keys.at(-1)]=Number(i.value);}
  return out;
}
function syncProgramKind(){
  const current=PROGRAMS.find(p=>p.id===editingProgram),kind=current?kindOf(current):progForm.elements.kind.value,info=kind==='info';
  $('#program-booking').hidden=info;$('#program-available-label').textContent=info?'Enabled (card shown on the homepage)':'Accepting bookings';$('#program-link-field').hidden=!info;
  const care=Boolean(current?.care);$('#program-care').hidden=!care;
  for(const id of ['#program-rate-field','#program-lesson-field','#program-slot-field'])$(id).hidden=care;
  for(const name of ['minSessions','lessonMinutes','slotMinutes'])progForm.elements[name].required=!info&&!care;
}
function openProgram(p){
  editingProgram=p?.id||null;const f=progForm.elements;
  $('#program-editor-title').textContent=p?p.name:'New program';$('#program-status').textContent='';
  $('#program-kind-field').hidden=Boolean(p);$('#program-kind-text').hidden=!p;if(p)$('#program-kind-text').textContent=`Type: ${kindText(p)}. The type cannot be changed after saving.`;
  f.kind.value='tutorial';f.name.value=p?.name||'';f.available.checked=p?p.available!==false:true;f.homepage.checked=p?p.homepage!==false:true;
  f.rate.value=p?.rate??'';f.minSessions.value=p?.minSessions??20;f.maxSessions.value=p?.maxSessions??'';f.lessonMinutes.value=p?.lessonMinutes??60;f.slotMinutes.value=p?.slotMinutes??60;f.note.value=p?.note||'';
  for(const name of ['icon','tagline','description','price','priceNote','linkText'])f[name].value=p?.[name]||'';
  f.details.value=(p?.details||[]).join('\n');f.notes.value=(p?.notes||[]).join('\n');
  const facebook=node('option','','Message us on Facebook (inquiry)');facebook.value='';
  f.link.replaceChildren(facebook,...PROGRAMS.filter(x=>x.mode&&x.id!==p?.id).map(x=>{const o=node('option','',`Book ${x.name}`);o.value=x.id;return o;}));f.link.value=p?.link||'';
  careGrid(p?.careRates);syncProgramKind();
  const builtIn=['online','kiddie-care'].includes(p?.id),off=p?.available===false;
  $('#delete-program').hidden=!p||builtIn||!off;$('#program-delete-hint').hidden=!p||(off&&!builtIn);$('#program-delete-hint').textContent=builtIn?'Built-in program: turn it off instead of deleting.':'To delete, turn it off and save first.';
  progEditor.showModal();f.name.focus();
}
async function savePrograms(next,text,remove){
  try{
    const data=await request('/api/admin/programs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({programs:next,remove})});
    setPrograms(data.programs);renderPrograms();renderLocations();if(editing===null)render();progEditor.close();setMessage(text,'success');
  }catch(error){if(progEditor.open)$('#program-status').textContent=error.message;else setMessage(error.message,'error');}
}
$('#add-program').addEventListener('click',()=>openProgram(null));
progEditor.querySelector('.popup-close').addEventListener('click',()=>progEditor.close());
progForm.elements.kind.addEventListener('change',syncProgramKind);
progForm.addEventListener('submit',event=>{
  event.preventDefault();
  const f=progForm.elements,current=PROGRAMS.find(p=>p.id===editingProgram),kind=current?kindOf(current):f.kind.value;
  const lines=v=>v.split('\n').map(x=>x.trim()).filter(Boolean),num=v=>v===''?undefined:Number(v),name=f.name.value.trim();
  let id=current?.id;if(!id){id=slug(name)||'program';for(let n=2;PROGRAMS.some(p=>p.id===id);n++)id=`${slug(name)}-${n}`;}
  const base={id,name,homepage:f.homepage.checked,icon:f.icon.value.trim(),tagline:f.tagline.value.trim(),description:f.description.value.trim(),details:lines(f.details.value),price:f.price.value.trim(),priceNote:f.priceNote.value.trim(),linkText:f.linkText.value.trim()};
  const program=kind==='info'?{...base,available:f.available.checked,link:f.link.value}:{...base,mode:current?.mode||'branch',...(current?.group||kind==='class'?{group:true}:{}),available:f.available.checked,
    minSessions:num(f.minSessions.value),maxSessions:num(f.maxSessions.value),rate:current?.care?null:num(f.rate.value)??null,
    lessonMinutes:current?.care?current.lessonMinutes:num(f.lessonMinutes.value),slotMinutes:current?.care?current.slotMinutes:num(f.slotMinutes.value),note:f.note.value.trim(),
    ...(current?.care?{care:true,careRates:readCare(),notes:lines(f.notes.value)}:{})};
  savePrograms(current?PROGRAMS.map(p=>p.id===id?program:p):[...PROGRAMS,program],`${name} saved. The homepage and booking page now use it.`);
});
$('#delete-program').addEventListener('click',async()=>{
  const current=PROGRAMS.find(p=>p.id===editingProgram);if(current?.available!==false)return;
  const typed=await confirmDelete('program',current.name,'Remove it from every teacher and location first.');
  if(typed)savePrograms(PROGRAMS.filter(p=>p.id!==current.id),`${current.name} deleted.`,{id:current.id,name:typed});
});

// Portfolio schedules (pp. 28–34) as paused teachers with placeholder emails; the center fills in the real emails.
$('#add-portfolio').addEventListener('click',async()=>{
  const missing=PORTFOLIO_TEACHERS.filter(p=>!teachers.some(t=>t.id===p.id));
  if(!missing.length||!confirm(`Add ${missing.length} teachers from the portfolio schedule? They start paused with placeholder emails (…@example.com). Open each one, enter the real Google email, save, connect Google Calendar, then turn on “Accepting bookings”.`))return;
  const button=$('#add-portfolio');button.disabled=true;setMessage('Adding portfolio teachers…');
  try{
    const saved=teachers.filter(t=>savedIds.has(t.id)).map(({googleConnected,...t})=>t);
    const data=await request('/api/admin/teachers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teachers:[...saved,...structuredClone(missing)]})});
    teachers=data.teachers;savedIds=new Set(teachers.map(t=>t.id));render();setMessage(`${missing.length} portfolio teachers added. Each one still needs its real Google email.`,'success');
  }catch(error){setMessage(error.message,'error');}
  finally{button.disabled=false;}
});

// Deleting takes three deliberate steps: confirm, confirm again, then type the exact name. Resolves to the typed name or null.
// The server repeats the checks: the item must already be disabled, and the typed name must match.
function confirmDelete(kind,name,warning){
  const dialog=$('#delete-dialog'),deleteForm=$('#delete-form'),next=$('#delete-next'),input=$('#delete-name'),cancel=$('#delete-cancel');
  let step=1;
  return new Promise(resolve=>{
    const show=()=>{
      $('#delete-step').textContent=`Step ${step} of 3`;$('#delete-name-field').hidden=step<3;input.value='';next.disabled=step===3;
      if(step===1){$('#delete-title').textContent=`Delete ${name}?`;$('#delete-text').textContent=`This ${kind} is disabled. Deleting removes it permanently. ${warning}`;next.textContent='Continue';}
      if(step===2){$('#delete-title').textContent='Are you sure?';$('#delete-text').textContent=`This cannot be undone. ${name} will be gone for good.`;next.textContent='Yes, I am sure';}
      if(step===3){$('#delete-title').textContent='Type the name to delete';$('#delete-text').textContent='Last step. This guards against deleting the wrong item.';$('#delete-name-label').textContent=`Type “${name}” exactly`;next.textContent=`Delete ${kind}`;input.focus();}
    };
    const onInput=()=>{next.disabled=input.value!==name;};
    const finish=result=>{deleteForm.removeEventListener('submit',onSubmit);input.removeEventListener('input',onInput);cancel.removeEventListener('click',onCancel);dialog.removeEventListener('cancel',onCancel);dialog.close();resolve(result);};
    const onSubmit=event=>{event.preventDefault();if(step<3){step++;show();}else if(input.value===name)finish(input.value);};
    const onCancel=event=>{event.preventDefault();finish(null);};
    deleteForm.addEventListener('submit',onSubmit);input.addEventListener('input',onInput);cancel.addEventListener('click',onCancel);dialog.addEventListener('cancel',onCancel);
    dialog.showModal();show();
  });
}
async function deleteTeacher(teacher){
  if(dirty){setMessage('Save or discard your changes to this teacher before deleting.','error');return;}
  const typed=await confirmDelete('teacher',teacher.name,'Their Google Calendar connection is removed. Past bookings stay in the records. Teachers with upcoming sessions cannot be deleted.');
  if(!typed)return;
  try{
    const saved=teachers.filter(t=>savedIds.has(t.id)&&t.id!==teacher.id).map(({googleConnected,...t})=>t);
    const data=await request('/api/admin/teachers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teachers:saved,remove:{id:teacher.id,name:typed}})});
    teachers=data.teachers;savedIds=new Set(teachers.map(t=>t.id));editing=null;dirty=false;render();setMessage(`${teacher.name} deleted.`,'success');
  }catch(error){setMessage(error.message,'error');}
}

// Reordering shows at once; one save goes out after the clicks stop (and again if more clicks came in while it was saving).
let orderTimer=null,orderSaving=false,orderPending=false;
function moveProgram(id,otherId,step){
  const next=[...PROGRAMS],i=next.findIndex(p=>p.id===id),j=next.findIndex(p=>p.id===otherId);if(i<0||j<0)return;
  [next[i],next[j]]=[next[j],next[i]];setPrograms(next);renderPrograms();
  const again=$(`[data-move="${id}:${step}"]`);(again&&!again.disabled?again:$(`[data-move="${id}:${-step}"]`))?.focus();
  setMessage('Homepage order changed · saving…');clearTimeout(orderTimer);orderTimer=setTimeout(syncOrder,1000);
}
async function syncOrder(){
  orderTimer=null;
  if(orderSaving){orderPending=true;return;}
  orderSaving=true;const sent=PROGRAMS.map(p=>p.id).join();
  try{
    const data=await request('/api/admin/programs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({programs:PROGRAMS})});
    // Only adopt the server copy if nothing moved while it was saving; otherwise the next save carries the newer order.
    if(PROGRAMS.map(p=>p.id).join()===sent&&!orderTimer){setPrograms(data.programs);renderPrograms();}
    if(!orderTimer&&!orderPending)setMessage('Homepage order saved.','success');
  }catch(error){
    orderPending=false;clearTimeout(orderTimer);orderTimer=null;
    try{const data=await request('/api/admin/programs');setPrograms(data.programs);renderPrograms();}catch{}
    setMessage(`The new order was not saved: ${error.message} The saved order is shown again.`,'error');
  }finally{
    orderSaving=false;
    if(orderPending){orderPending=false;syncOrder();}
  }
}
window.addEventListener('beforeunload',event=>{if(orderTimer||orderSaving)event.preventDefault();});
