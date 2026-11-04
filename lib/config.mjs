import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {DEFAULT_GALLERIES,PROGRAMS,DEFAULT_PROGRAMS,CARE_TYPES,setPrograms,AREAS,DEFAULT_BRANCHES,PREVIEW_TEACHERS,PERIOD_TYPES,validDate,minutes} from '../shared.mjs';
// Branch photos are either bundled images or files uploaded through /admin.
export const BRANCH_PHOTO=/^(assets\/branch-[a-z0-9-]+\.webp|branch-photos\/[a-f0-9]{24}\.(jpg|png|webp))$/;
// Programs edited in /admin. Ids, kind (bookable or info), mode, group and care stay fixed once saved (teachers and branches refer to them).
export function validatePrograms(list,current){
  if(!Array.isArray(list)||!list.length||list.length>40)throw new Error('Add between 1 and 40 programs.');
  const ids=new Set(),before=new Map((current||[]).map(p=>[p.id,p]));
  const programs=list.map(p=>{
    if(!/^[a-z0-9-]{2,60}$/.test(p?.id)||ids.has(p.id))throw new Error('Each program needs a unique id.');
    ids.add(p.id);
    const label=typeof p.name==='string'&&p.name.trim()?p.name.trim():p.id;
    const text=(key,max,what,min=0)=>{const v=p[key]===undefined?'':p[key];if(typeof v!=='string'||v.trim().length<min||v.trim().length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))throw new Error(`${label}: ${what} must be ${min?`${min} to `:'up to '}${max} characters.`);return v.trim();};
    const lines=(key,what,max=8)=>{const v=p[key]??[];if(!Array.isArray(v)||v.length>max||v.some(x=>typeof x!=='string'||!x.trim()||x.length>250))throw new Error(`${label}: up to ${max} ${what} of up to 250 characters each.`);return v.map(x=>x.trim());};
    const int=(key,min,max,what)=>{const v=p[key];if(!Number.isInteger(v)||v<min||v>max)throw new Error(`${label}: ${what} must be a whole number from ${min} to ${max}.`);return v;};
    if(p.homepage!==undefined&&typeof p.homepage!=='boolean'||p.available!==undefined&&typeof p.available!=='boolean')throw new Error(`${label}: invalid on/off setting.`);
    const out={id:p.id,name:text('name',80,'the name',2),homepage:p.homepage!==false,icon:text('icon',16,'the icon'),tagline:text('tagline',120,'the tagline'),description:text('description',600,'the description'),details:lines('details','detail lines'),price:text('price',160,'the price text'),priceNote:text('priceNote',250,'the price note'),linkText:text('linkText',60,'the button text')};
    const was=before.get(p.id);
    if(!p.mode){
      if(was?.mode)throw new Error(`${label}: a bookable program cannot become an info card.`);
      if(typeof (p.link??'')!=='string')throw new Error(`${label}: invalid button link.`);
      return {...out,available:p.available!==false,link:p.link??''};
    }
    if(!['online','branch'].includes(p.mode)||(p.mode==='online')!==(p.id==='online'))throw new Error(`${label}: only Online Tutorial is online; other programs are face to face.`);
    if(Boolean(p.care)!==(p.id==='kiddie-care'))throw new Error(`${label}: only KieAn Kiddie Care uses care pricing.`);
    if(was&&(was.mode!==p.mode||Boolean(was.group)!==Boolean(p.group)))throw new Error(`${label}: the program type cannot be changed after it is saved.`);
    const minSessions=int('minSessions',1,40,'Minimum sessions');
    const maxSessions=p.maxSessions==null?undefined:int('maxSessions',minSessions,40,'Maximum sessions');
    const lessonMinutes=int('lessonMinutes',15,720,'Lesson minutes'),slotMinutes=int('slotMinutes',lessonMinutes,720,'Time blocked per session');
    if(slotMinutes%15)throw new Error(`${label}: time blocked per session must be in 15-minute steps.`);
    const rate=p.rate==null?null:int('rate',1,100000,'Price per session');
    const booked={...out,mode:p.mode,...(p.group?{group:true}:{}),available:p.available!==false,minSessions,...(maxSessions?{maxSessions}:{}),rate,lessonMinutes,slotMinutes,note:text('note',200,'the booking page note')};
    if(!p.care)return booked;
    return {...booked,care:true,careRates:validateCareRates(p.careRates,label),notes:lines('notes','care notes')};
  });
  for(const p of programs)if(p.link&&!programs.some(x=>x.id===p.link&&x.mode))throw new Error(`${p.name}: its button must open a bookable program.`);
  if(!programs.some(p=>p.id==='online'))throw new Error('Online Tutorial cannot be removed. Turn off “Accepting bookings” instead.');
  if(before.has('kiddie-care')&&!programs.some(p=>p.id==='kiddie-care'))throw new Error('KieAn Kiddie Care cannot be removed. Turn off “Accepting bookings” instead.');
  return programs;
}
// Kiddie Care prices: a blank (missing) price means that option is not offered.
function validateCareRates(rates,label){
  const price=v=>{if(v==null||v==='')return undefined;if(!Number.isInteger(v)||v<1||v>100000)throw new Error(`${label}: care prices must be whole pesos from 1 to 100,000.`);return v;};
  const byNeeds=(obj,hours)=>{const out={};for(const needs of ['regular','special']){const row={};for(const h of hours){const v=price(obj?.[needs]?.[h]);if(v)row[h]=v;}if(Object.keys(row).length)out[needs]=row;}return out;};
  const pair=obj=>{const out={};for(const needs of ['regular','special']){const v=price(obj?.[needs]);if(v)out[needs]=v;}return out;};
  const out={};
  for(const [id,type] of Object.entries(CARE_TYPES)){
    const r=rates?.[id];if(!r)continue;
    if(type.walkIn){
      if(!Number.isInteger(r.maxHours)||r.maxHours<1||r.maxHours>24)throw new Error(`${label}: walk-in maximum hours must be 1 to 24.`);
      const perHour=pair(r.perHour);if(Object.keys(perHour).length)out[id]={maxHours:r.maxHours,perHour};continue;
    }
    const entry={rates:byNeeds(r.rates,type.hourOptions),monthly:byNeeds(r.monthly,type.hourOptions)};
    if(id==='day'){const day=pair(r.tutorial?.day),month=pair(r.tutorial?.month);if(Object.keys(day).length||Object.keys(month).length)entry.tutorial={day,month};}
    if(Object.keys(entry.rates).length||Object.keys(entry.monthly).length)out[id]=entry;
  }
  if(!Object.keys(out).length)throw new Error(`${label}: add at least one care price.`);
  return out;
}
// Gallery photos are bundled permit/testimonial images or files uploaded through /admin.
const GALLERY_PHOTO=/^(assets\/(permit|testimonials)-[a-z0-9-]+\.webp|branch-photos\/[a-f0-9]{24}\.(jpg|png|webp))$/;
export function validateGalleries(galleries){
  if(!galleries||typeof galleries!=='object')throw new Error('Invalid photo galleries.');
  const out={};
  for(const [kind,label] of [['testimonials','Feedback'],['permits','Permits']]){
    const list=galleries[kind];
    if(!Array.isArray(list)||list.length>30)throw new Error(`${label}: up to 30 photos.`);
    out[kind]=list.map(item=>{
      const text=(v,max)=>{if(v===undefined)return '';if(typeof v!=='string'||v.length>max||/[\x00-\x1f\x7f]/.test(v))throw new Error(`${label}: captions and descriptions are up to ${max} characters.`);return v.trim();};
      if(typeof item?.src!=='string'||!GALLERY_PHOTO.test(item.src)||(item.thumb!==undefined&&(typeof item.thumb!=='string'||!GALLERY_PHOTO.test(item.thumb))))throw new Error(`${label}: invalid photo.`);
      const photo={src:item.src,...(item.thumb?{thumb:item.thumb}:{}),alt:text(item.alt,200)};
      if(kind==='permits')photo.caption=text(item.caption,120);
      return photo;
    });
  }
  return out;
}
export function validateBranches(branches){
  if(!Array.isArray(branches)||!branches.length)throw new Error('Add at least one location.');
  const ids=new Set(),branchPrograms=PROGRAMS.filter(p=>p.mode==='branch').map(p=>p.id),areaIds=new Set(AREAS.map(a=>a.id));
  return branches.map(b=>{
    const name=typeof b?.name==='string'?b.name.trim():'',address=typeof b?.address==='string'?b.address.trim():'';
    if(!/^[a-z0-9-]{2,60}$/.test(b?.id)||b.id==='online'||ids.has(b.id))throw new Error('Each location needs a unique id.');
    if(name.length<2||name.length>80||address.length>300)throw new Error('Each location needs a name (up to 80 characters) and an address (up to 300).');
    if(b.available!==undefined&&typeof b.available!=='boolean')throw new Error('Location availability must be true or false.');
    if(!Array.isArray(b.programs)||!b.programs.length||b.programs.some(p=>!branchPrograms.includes(p)))throw new Error(`${name}: choose at least one face-to-face program.`);
    if(!Array.isArray(b.areas)||b.areas.some(a=>!areaIds.has(a)))throw new Error(`${name}: choose service areas from the list.`);
    if(!Array.isArray(b.photos)||b.photos.length>12||b.photos.some(p=>typeof p!=='string'||!BRANCH_PHOTO.test(p)))throw new Error(`${name}: up to 12 photos.`);
    if(b.rates!==undefined&&(typeof b.rates!=='object'||Object.entries(b.rates).some(([k,v])=>!branchPrograms.includes(k)||!Number.isInteger(v)||v<1)))throw new Error(`${name}: invalid rates.`);
    ids.add(b.id);
    return {id:b.id,name,address,available:b.available!==false,programs:[...new Set(b.programs)],areas:[...new Set(b.areas)],photos:b.photos,...(b.rates?{rates:b.rates}:{})};
  });
}
export function validateTeacherRoster(teachers,branches=DEFAULT_BRANCHES){
  if(!Array.isArray(teachers)||!teachers.length)throw new Error('Add at least one teacher to the roster.');
  const ids=new Set(),googleEmails=new Set();
  for(const t of teachers){
    if(!/^[a-z0-9-]{2,60}$/.test(t.id)||ids.has(t.id)||!t.name||typeof t.bio!=='string'||t.bio.length>350||typeof t.googleEmail!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.googleEmail)||googleEmails.has(t.googleEmail.toLowerCase()))throw new Error('Each teacher needs a unique id, Google email, name and a bio of up to 350 characters.');
    if(t.available!==undefined&&typeof t.available!=='boolean')throw new Error('Teacher availability must be true or false.');
    t.available??=true;ids.add(t.id);googleEmails.add(t.googleEmail.toLowerCase());
    if(!Array.isArray(t.programs)||!t.programs.length||t.programs.some(p=>!PROGRAMS.some(x=>x.id===p&&x.mode)))throw new Error('Each teacher needs at least one valid program.');
    if(!Array.isArray(t.branches)||!t.branches.length||t.branches.some(b=>b!=='online'&&!branches.some(x=>x.id===b)))throw new Error('Each teacher needs at least one valid branch.');
    for(const programId of t.programs){
      const program=PROGRAMS.find(p=>p.id===programId);
      if(program.mode==='online'&&!t.branches.includes('online'))throw new Error('Online Tutorial requires the online branch.');
      if(program.mode==='branch'&&!t.branches.some(branch=>branch!=='online'))throw new Error(`${program.name} requires at least one physical branch.`);
    }
    if(!t.weekly||!Object.keys(t.weekly).length||!Object.values(t.weekly).some(ranges=>Array.isArray(ranges)&&ranges.length))throw new Error('Add at least one teacher working period.');
    for(const [day,ranges] of Object.entries(t.weekly)){
      if(!/^[0-6]$/.test(day)||!Array.isArray(ranges))throw new Error('weekly uses day keys 0 to 6.');
      for(const range of ranges){
        if(!Array.isArray(range)||![2,3,4].includes(range.length)||range.slice(0,2).some(s=>typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))||(minutes(range[0])>=minutes(range[1])&&range[2]!=='kiddie-night')||minutes(range[0])===minutes(range[1])||(range.length>=3&&!PERIOD_TYPES.some(p=>p.id===range[2])))throw new Error('Invalid teacher working hours.');
        // Class periods (Playgroup, Nursery, Kiddie Care) need a class size; other periods must not have one.
        const group=PERIOD_TYPES.find(p=>p.id===range[2])?.group;
        if(group?!(Number.isInteger(range[3])&&range[3]>=1&&range[3]<=20):range.length===4)throw new Error('Class periods need a class size from 1 to 20.');
      }
    }
    t.blackoutDates??=[];if(!Array.isArray(t.blackoutDates)||t.blackoutDates.some(d=>!validDate(d)))throw new Error('Invalid blackout dates.');
  }
  return teachers;
}
export function loadConfig(){
  const file=resolve(process.env.KIEAN_CONFIG||'config.json');
  if(!existsSync(file)){
    if(process.env.NODE_ENV==='production')throw new Error('Production requires KIEAN_CONFIG or config.json.');
    setPrograms(DEFAULT_PROGRAMS);
    return {preview:true,leadMinutes:60,programs:DEFAULT_PROGRAMS,teachers:PREVIEW_TEACHERS,branches:structuredClone(DEFAULT_BRANCHES),port:Number(process.env.PORT||3000)};
  }
  let config;
  try{config=JSON.parse(readFileSync(file,'utf8'));}catch(error){throw new Error(`${file} is not valid JSON (${error.message}). It must be one complete object starting with { and ending with } — copy config.example.json or your working config.json.`);}
  if(!config||typeof config!=='object'||Array.isArray(config))throw new Error(`${file} must be a JSON object starting with {.`);
  Object.defineProperty(config,'configFile',{value:file});
  config.preview=config.mode!=='live';config.leadMinutes=config.leadMinutes??60;config.port=Number(process.env.PORT||3000);
  if(process.env.NODE_ENV==='production'&&config.preview)throw new Error('Production requires mode: live.');
  if(config.preview){setPrograms(DEFAULT_PROGRAMS);config.programs=DEFAULT_PROGRAMS;config.teachers=PREVIEW_TEACHERS;config.branches=structuredClone(DEFAULT_BRANCHES);return config;}
  if(!Number.isInteger(config.leadMinutes)||config.leadMinutes<60)throw new Error('leadMinutes must be at least 60.');
  // Google allows http redirect URIs only for localhost; permit that for local testing outside production.
  const origin=config.publicOrigin&&new URL(config.publicOrigin),localDev=process.env.NODE_ENV!=='production'&&origin?.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname);
  if(!origin||(origin.protocol!=='https:'&&!localDev))throw new Error('Live mode requires an HTTPS publicOrigin (http://localhost allowed outside production).');
  config.publicOrigin=new URL(config.publicOrigin).origin;
  // Configs from before /admin managed programs and locations start with the portfolio defaults.
  config.programs=validatePrograms(config.programs??structuredClone(DEFAULT_PROGRAMS));setPrograms(config.programs);
  config.galleries=validateGalleries(config.galleries??structuredClone(DEFAULT_GALLERIES));
  // Configs from before /admin managed locations start with the portfolio branches.
  config.branches=validateBranches(config.branches??structuredClone(DEFAULT_BRANCHES));
  validateTeacherRoster(config.teachers,config.branches);
  if(config.centerEmail!==undefined&&(typeof config.centerEmail!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.centerEmail)))throw new Error('centerEmail must be an email address.');
  if(config.paymentInstructions!==undefined&&typeof config.paymentInstructions!=='string')throw new Error('paymentInstructions must be text.');
  if(!process.env.GOOGLE_OAUTH_CLIENT_ID||!process.env.GOOGLE_OAUTH_CLIENT_SECRET)throw new Error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.');
  const tokenKey=process.env.KIEAN_TOKEN_ENCRYPTION_KEY;
  if(!tokenKey||Buffer.from(tokenKey,'base64').length!==32||Buffer.from(tokenKey,'base64').toString('base64')!==tokenKey)throw new Error('Set KIEAN_TOKEN_ENCRYPTION_KEY to a base64-encoded 32-byte key.');
  return config;
}
export function publicConfig(config,store){return {preview:config.preview,teachers:config.teachers.map(({id,name,bio,programs,branches,weekly,blackoutDates,available})=>({id,name,bio,programs,branches,weekly,blackoutDates,available:available!==false,...(!config.preview?{googleConnected:Boolean(store?.hasGoogleToken(id))}:{})})),branches:(config.branches||DEFAULT_BRANCHES).map(({id,name,address,available,programs,areas,photos,rates})=>({id,name,address,available,programs,areas,photos,rates})),programs:config.programs||DEFAULT_PROGRAMS,galleries:config.galleries||DEFAULT_GALLERIES,leadMinutes:config.leadMinutes,paymentInstructions:config.paymentInstructions||''};}
