import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {PROGRAMS,BRANCHES,PREVIEW_TEACHERS,validDate,minutes} from '../shared.mjs';
export function validateTeacherRoster(teachers){
  if(!Array.isArray(teachers)||!teachers.length)throw new Error('Add at least one teacher to the roster.');
  const ids=new Set(),googleEmails=new Set();
  for(const t of teachers){
    if(!/^[a-z0-9-]{2,60}$/.test(t.id)||ids.has(t.id)||!t.name||typeof t.bio!=='string'||typeof t.googleEmail!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.googleEmail)||googleEmails.has(t.googleEmail.toLowerCase()))throw new Error('Each teacher needs a unique id, Google email, name and bio.');
    if(t.available!==undefined&&typeof t.available!=='boolean')throw new Error('Teacher availability must be true or false.');
    t.available??=true;ids.add(t.id);googleEmails.add(t.googleEmail.toLowerCase());
    if(!Array.isArray(t.programs)||!t.programs.length||t.programs.some(p=>!PROGRAMS.some(x=>x.id===p)))throw new Error('Each teacher needs at least one valid program.');
    if(!Array.isArray(t.branches)||!t.branches.length||t.branches.some(b=>b!=='online'&&!BRANCHES.some(x=>x.id===b)))throw new Error('Each teacher needs at least one valid branch.');
    for(const programId of t.programs){
      const program=PROGRAMS.find(p=>p.id===programId);
      if(program.mode==='online'&&!t.branches.includes('online'))throw new Error('Online Tutorial requires the online branch.');
      if(program.mode==='branch'&&!t.branches.some(branch=>branch!=='online'))throw new Error(`${program.name} requires at least one physical branch.`);
    }
    if(!t.weekly||!Object.keys(t.weekly).length||!Object.values(t.weekly).some(ranges=>Array.isArray(ranges)&&ranges.length))throw new Error('Add at least one teacher working period.');
    for(const [day,ranges] of Object.entries(t.weekly)){
      if(!/^[0-6]$/.test(day)||!Array.isArray(ranges))throw new Error('weekly uses day keys 0 to 6.');
      for(const range of ranges)if(!Array.isArray(range)||range.length!==2||range.some(s=>typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))||minutes(range[0])>=minutes(range[1]))throw new Error('Invalid teacher working hours.');
    }
    t.blackoutDates??=[];if(!Array.isArray(t.blackoutDates)||t.blackoutDates.some(d=>!validDate(d)))throw new Error('Invalid blackout dates.');
  }
  return teachers;
}
export function loadConfig(){
  const file=resolve(process.env.KIEAN_CONFIG||'config.json');
  if(!existsSync(file)){
    if(process.env.NODE_ENV==='production')throw new Error('Production requires KIEAN_CONFIG or config.json.');
    return {preview:true,leadMinutes:60,teachers:PREVIEW_TEACHERS,port:Number(process.env.PORT||3000)};
  }
  const config=JSON.parse(readFileSync(file,'utf8'));
  Object.defineProperty(config,'configFile',{value:file});
  config.preview=config.mode!=='live';config.leadMinutes=config.leadMinutes??60;config.port=Number(process.env.PORT||3000);
  if(process.env.NODE_ENV==='production'&&config.preview)throw new Error('Production requires mode: live.');
  if(config.preview){config.teachers=PREVIEW_TEACHERS;return config;}
  if(!Number.isInteger(config.leadMinutes)||config.leadMinutes<60)throw new Error('leadMinutes must be at least 60.');
  if(!config.publicOrigin||new URL(config.publicOrigin).protocol!=='https:')throw new Error('Live mode requires an HTTPS publicOrigin.');
  config.publicOrigin=new URL(config.publicOrigin).origin;
  validateTeacherRoster(config.teachers);
  if(!process.env.GOOGLE_OAUTH_CLIENT_ID||!process.env.GOOGLE_OAUTH_CLIENT_SECRET)throw new Error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.');
  const tokenKey=process.env.KIEAN_TOKEN_ENCRYPTION_KEY;
  if(!tokenKey||Buffer.from(tokenKey,'base64').length!==32||Buffer.from(tokenKey,'base64').toString('base64')!==tokenKey)throw new Error('Set KIEAN_TOKEN_ENCRYPTION_KEY to a base64-encoded 32-byte key.');
  return config;
}
export function publicConfig(config,store){return {preview:config.preview,teachers:config.teachers.map(({id,name,bio,programs,branches,weekly,blackoutDates,available})=>({id,name,bio,programs,branches,weekly,blackoutDates,available:available!==false,...(!config.preview?{googleConnected:Boolean(store?.hasGoogleToken(id))}:{})})),leadMinutes:config.leadMinutes};}
