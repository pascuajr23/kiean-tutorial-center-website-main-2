import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {PROGRAMS,BRANCHES,PREVIEW_TEACHERS,validDate,minutes} from '../shared.mjs';
export function loadConfig(){
  const file=resolve(process.env.KIEAN_CONFIG||'config.json');
  if(!existsSync(file)){
    if(process.env.NODE_ENV==='production')throw new Error('Production requires KIEAN_CONFIG or config.json.');
    return {preview:true,leadMinutes:60,teachers:PREVIEW_TEACHERS,port:Number(process.env.PORT||3000)};
  }
  const config=JSON.parse(readFileSync(file,'utf8'));
  config.preview=config.mode!=='live';config.leadMinutes=config.leadMinutes??60;config.port=Number(process.env.PORT||3000);
  if(process.env.NODE_ENV==='production'&&config.preview)throw new Error('Production requires mode: live.');
  if(config.preview){config.teachers=PREVIEW_TEACHERS;return config;}
  if(!Number.isInteger(config.leadMinutes)||config.leadMinutes<60)throw new Error('leadMinutes must be at least 60.');
  if(!config.publicOrigin||new URL(config.publicOrigin).protocol!=='https:')throw new Error('Live mode requires an HTTPS publicOrigin.');
  config.publicOrigin=new URL(config.publicOrigin).origin;
  if(!Array.isArray(config.teachers)||!config.teachers.length)throw new Error('Add the actual teacher roster to config.json.');
  const ids=new Set(),googleEmails=new Set();
  for(const t of config.teachers){
    if(!/^[a-z0-9-]{2,60}$/.test(t.id)||ids.has(t.id)||!t.name||typeof t.bio!=='string'||typeof t.googleEmail!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.googleEmail)||googleEmails.has(t.googleEmail.toLowerCase()))throw new Error('Each teacher needs a unique id, Google email, name and bio.');
    ids.add(t.id);googleEmails.add(t.googleEmail.toLowerCase());
    if(!Array.isArray(t.programs)||!t.programs.length||t.programs.some(p=>!PROGRAMS.some(x=>x.id===p)))throw new Error('Invalid teacher programs.');
    if(!Array.isArray(t.branches)||!t.branches.length||t.branches.some(b=>b!=='online'&&!BRANCHES.some(x=>x.id===b)))throw new Error('Invalid teacher branches.');
    if(!t.weekly||!Object.keys(t.weekly).length)throw new Error('Teacher working hours are required.');
    for(const [day,ranges] of Object.entries(t.weekly)){
      if(!/^[0-6]$/.test(day)||!Array.isArray(ranges))throw new Error('weekly uses day keys 0 to 6.');
      for(const range of ranges)if(!Array.isArray(range)||range.length!==2||range.some(s=>typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))||minutes(range[0])>=minutes(range[1]))throw new Error('Invalid teacher working hours.');
    }
    t.blackoutDates??=[];if(!Array.isArray(t.blackoutDates)||t.blackoutDates.some(d=>!validDate(d)))throw new Error('Invalid blackout dates.');
  }
  if(!process.env.GOOGLE_OAUTH_CLIENT_ID||!process.env.GOOGLE_OAUTH_CLIENT_SECRET)throw new Error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.');
  const tokenKey=process.env.KIEAN_TOKEN_ENCRYPTION_KEY;
  if(!tokenKey||Buffer.from(tokenKey,'base64').length!==32||Buffer.from(tokenKey,'base64').toString('base64')!==tokenKey)throw new Error('Set KIEAN_TOKEN_ENCRYPTION_KEY to a base64-encoded 32-byte key.');
  return config;
}
export function publicConfig(config,store){return {preview:config.preview,teachers:config.teachers.map(({id,name,bio,programs,branches,weekly,blackoutDates})=>({id,name,bio,programs,branches,weekly,blackoutDates,...(!config.preview?{googleConnected:Boolean(store?.hasGoogleToken(id))}:{})})),leadMinutes:config.leadMinutes};}
