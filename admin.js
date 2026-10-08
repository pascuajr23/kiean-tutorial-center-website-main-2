import {BRANCHES,PROGRAMS} from './shared.mjs';

const $=selector=>document.querySelector(selector);
const list=$('#teacher-list'),form=$('#roster-form'),message=$('#admin-message');
let teachers=[],savedIds=new Set();
const branchOptions=[{id:'online',name:'Online'},...BRANCHES];
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function node(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
function initials(name){return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'KT';}
function setMessage(text,kind='info') {message.textContent=text;message.dataset.kind=kind;}
async function request(url,options){
  const response=await fetch(url,{credentials:'same-origin',...options});
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
function makeTimeRange(list,range={},day='day'){
  const row=node('div','time-range'),start=node('input'),end=node('input'),remove=node('button','remove-period','×');
  start.type=end.type='time';start.value=range[0]||'';end.value=range[1]||'';start.required=end.required=true;start.dataset.timeField='start';end.dataset.timeField='end';start.setAttribute('aria-label',`${day} available from`);end.setAttribute('aria-label',`${day} available until`);
  remove.type='button';remove.setAttribute('aria-label','Remove availability period');remove.addEventListener('click',()=>row.remove());
  row.append(start,node('span','range-separator','to'),end,remove);list.append(row);
}
function makeTeacherCard(teacher){
  const card=node('article','teacher-card');card.dataset.teacherId=teacher.id;
  const head=node('div','teacher-card-head'),identity=node('div','teacher-identity');
  identity.append(node('span','teacher-initials',initials(teacher.name)));identity.lastChild.setAttribute('aria-hidden','true');
  const title=node('div','teacher-title');title.append(node('h2','',teacher.name||'New teacher'),node('code','teacher-id',teacher.id));identity.append(title);head.append(identity);
  if(!savedIds.has(teacher.id)){
    const remove=node('button','draft-remove','Remove draft');remove.type='button';remove.addEventListener('click',()=>{teachers=readForm().filter(item=>item.id!==teacher.id);render();});head.append(remove);
  }
  const availability=node('label','availability-switch'),toggle=node('input');toggle.type='checkbox';toggle.checked=teacher.available!==false;toggle.dataset.field='available';
  availability.append(toggle,node('span','','Accepting bookings'));head.append(availability);card.append(head);
  const body=node('div','teacher-card-body'),fields=node('div','teacher-fields');
  addField(fields,'Teacher name',teacher.name,{field:'name',maxLength:100});
  const email=addField(fields,'Google account email',teacher.googleEmail,{field:'googleEmail',type:'email',readOnly:Boolean(teacher.googleConnected),maxLength:200});
  email.autocomplete='email';
  addField(fields,'Short introduction',teacher.bio,{field:'bio',type:'textarea',maxLength:300});fields.lastElementChild.classList.add('admin-field-bio');
  body.append(fields);
  const groups=node('div','selection-groups'),programs=node('fieldset','selection-group'),branches=node('fieldset','selection-group');
  addOptions(programs,'Programs',PROGRAMS,teacher.programs||[],'programs');
  addOptions(branches,'Branches',branchOptions,teacher.branches||[],'branches');groups.append(programs,branches);body.append(groups);
  const schedule=node('fieldset','weekly-group');schedule.append(node('legend','selection-title','Weekly hours · Philippine Time'));
  const weeklyGrid=node('div','weekly-grid');
  weekdays.forEach((day,index)=>{
    const dayKey=String(index),ranges=teacher.weekly?.[dayKey]||[],row=node('div','weekday-row');row.dataset.weekday=dayKey;
    const dayLabel=node('label','weekday-toggle'),dayToggle=node('input');dayToggle.type='checkbox';dayToggle.checked=ranges.length>0;dayToggle.dataset.dayToggle='true';dayLabel.append(dayToggle,node('span','',day));
    const rangeList=node('div','day-ranges');for(const range of ranges)makeTimeRange(rangeList,range,day);
    const addPeriod=node('button','add-period','Add hours');addPeriod.type='button';addPeriod.disabled=!dayToggle.checked;addPeriod.addEventListener('click',()=>makeTimeRange(rangeList,{},day));
    dayToggle.addEventListener('change',()=>{addPeriod.disabled=!dayToggle.checked;rangeList.querySelectorAll('input,button').forEach(control=>{control.disabled=!dayToggle.checked;});});
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
function render(){
  list.replaceChildren(...teachers.map(makeTeacherCard));
  $('#teacher-count').textContent=String(teachers.length);
  $('#bookable-count').textContent=String(teachers.filter(teacher=>teacher.available!==false&&teacher.googleConnected).length);
  form.hidden=false;
}
function readForm(){
  return [...list.querySelectorAll('.teacher-card')].map(card=>{
    const current=teachers.find(teacher=>teacher.id===card.dataset.teacherId);
    const value=field=>card.querySelector(`[data-field="${field}"]`);
    const selected=group=>[...card.querySelectorAll(`[data-group="${group}"]:checked`)].map(input=>input.value);
    const weekly={};
    for(const row of card.querySelectorAll('.weekday-row')){
      if(!row.querySelector('[data-day-toggle]').checked)continue;
      const ranges=[...row.querySelectorAll('.time-range')].map(range=>[range.querySelector('[data-time-field="start"]').value,range.querySelector('[data-time-field="end"]').value]);
      if(ranges.length)weekly[row.dataset.weekday]=ranges;
    }
    return {...current,name:value('name').value.trim(),googleEmail:value('googleEmail').value.trim().toLowerCase(),bio:value('bio').value.trim(),available:value('available').checked,programs:selected('programs'),branches:selected('branches'),weekly};
  });
}
async function load(){
  setMessage('Loading teacher roster…');
  try{const data=await request('/api/admin/teachers');teachers=data.teachers;savedIds=new Set(teachers.map(teacher=>teacher.id));render();setMessage('Roster loaded.','success');}
  catch(error){setMessage(error.message==='fetch failed'?'Could not reach the booking server.':error.message,'error');form.hidden=true;}
}
async function refreshConnections(){
  try{
    const statuses=new Map((await request('/api/admin/teachers')).teachers.map(teacher=>[teacher.id,teacher.googleConnected]));
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
  teachers=readForm();
  teachers.push({id:`teacher-${crypto.randomUUID().slice(0,8)}`,name:'New teacher',bio:'',googleEmail:'',available:false,programs:['online'],branches:['online'],weekly:{},blackoutDates:[]});
  render();list.lastElementChild?.scrollIntoView({behavior:'smooth',block:'center'});list.lastElementChild?.querySelector('[data-field="name"]')?.focus();setMessage('New teacher draft added.');
});
form.addEventListener('submit',async event=>{
  event.preventDefault();const button=$('#save-roster');button.disabled=true;setMessage('Saving teacher roster…');
  try{const data=await request('/api/admin/teachers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teachers:readForm()})});teachers=data.teachers;savedIds=new Set(teachers.map(teacher=>teacher.id));render();setMessage('Teacher settings saved.','success');}
  catch(error){setMessage(error.message,'error');}
  finally{button.disabled=false;}
});
load();
window.addEventListener('focus',refreshConnections);
