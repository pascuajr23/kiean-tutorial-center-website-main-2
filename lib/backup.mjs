import {mkdirSync,copyFileSync,cpSync,readdirSync,rmSync,existsSync,statSync} from 'node:fs';
import {join} from 'node:path';

// One folder per day (data/backups/YYYY-MM-DD) with the database, settings and branch photos; the newest `keep` days stay.
export function runBackup({store,configFile,photosDir,dir,keep=14,now=new Date()}){
  const target=join(dir,phDay(now));
  mkdirSync(target,{recursive:true,mode:0o700});
  const db=join(target,'bookings.sqlite');
  rmSync(db,{force:true});
  // VACUUM INTO writes a consistent copy even while bookings are being written.
  store.db.exec(`VACUUM INTO '${db.replaceAll("'","''")}'`);
  if(configFile&&existsSync(configFile))copyFileSync(configFile,join(target,'config.json'));
  rmSync(join(target,'branch-photos'),{recursive:true,force:true});
  if(photosDir&&existsSync(photosDir))cpSync(photosDir,join(target,'branch-photos'),{recursive:true});
  for(const old of readdirSync(dir).filter(name=>/^\d{4}-\d{2}-\d{2}$/.test(name)).sort().slice(0,-keep))rmSync(join(dir,old),{recursive:true,force:true});
  return target;
}

// The Philippines is UTC+8 all year (no daylight saving), so folders are named by the Philippine date.
const PH_OFFSET=8*3_600_000,DAY=86_400_000;
export const phDay=date=>new Date(date.getTime()+PH_OFFSET).toISOString().slice(0,10);
export const msUntilPhMidnight=(now=new Date())=>DAY-((now.getTime()+PH_OFFSET)%DAY);

// Runs at every midnight Philippine time.
export function scheduleBackups(options){
  let timer;
  const next=()=>{timer=setTimeout(()=>{try{console.log('Backup saved:',runBackup(options));}catch(error){console.error('Backup failed:',error.message);}next();},msUntilPhMidnight()+1000);timer.unref();};
  next();
  return ()=>clearTimeout(timer);
}

// Newest first, for the admin Backups screen.
export function listBackups(dir){
  if(!existsSync(dir))return [];
  const size=path=>statSync(path).isDirectory()?readdirSync(path).reduce((sum,name)=>sum+size(join(path,name)),0):statSync(path).size;
  return readdirSync(dir).filter(name=>/^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse().map(day=>{
    const folder=join(dir,day),photos=join(folder,'branch-photos');
    const db=join(folder,'bookings.sqlite');
    return {day,savedAt:statSync(existsSync(db)?db:folder).mtime.toISOString(),size:size(folder),database:existsSync(join(folder,'bookings.sqlite')),settings:existsSync(join(folder,'config.json')),photos:existsSync(photos)?readdirSync(photos).length:0};
  });
}
