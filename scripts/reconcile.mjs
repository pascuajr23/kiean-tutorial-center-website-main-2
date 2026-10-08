import {resolve} from 'node:path';
import {loadConfig} from '../lib/config.mjs';
import {BookingStore} from '../lib/store.mjs';
import {GoogleCalendar} from '../lib/calendar.mjs';
import {GoogleOAuth} from '../lib/google-oauth.mjs';
const args=process.argv.slice(2),config=loadConfig();
if(config.preview)throw new Error('Reconciliation is available only in live mode.');
const store=new BookingStore(resolve(process.env.KIEAN_DATA_DIR||'data','bookings.sqlite'),{tokenEncryptionKey:process.env.KIEAN_TOKEN_ENCRYPTION_KEY});
const oauth=new GoogleOAuth({clientId:process.env.GOOGLE_OAUTH_CLIENT_ID,clientSecret:process.env.GOOGLE_OAUTH_CLIENT_SECRET,redirectUri:`${config.publicOrigin}/api/google/callback`});
try{
  if(!args.includes('--cancel-pending')&&!args.includes('--cancel')){
    const jobs=store.unresolved();
    for(const b of jobs)console.log(`${b.reference} | ${b.status} | ${b.sessions.length} sessions | created ${b.createdAt}`);
    console.log(`${jobs.length} unresolved requests. Nothing changed.`);
  }else{
    if(!args.includes('--server-stopped'))throw new Error('Stop the booking server before cancellation; then pass --server-stopped.');
    const ref=args.includes('--cancel')?args[args.indexOf('--cancel')+1]:null;
    const jobs=ref?[store.byReference(ref)].filter(Boolean):store.unresolved();
    if(ref&&!jobs.length)throw new Error('Booking reference not found.');
    const calendar=new GoogleCalendar({store,oauth});
    for(const booking of jobs){
      if(['cancelled','failed'].includes(booking.status)){console.log(`${booking.reference}: already inactive.`);continue;}
      if(Date.now()-Date.parse(booking.createdAt)<300000)throw new Error('Wait until the request is at least five minutes old before reconciliation.');
      let success=true;
      for(const session of booking.sessions){try{await calendar.remove(booking,session);}catch{success=false;}}
      store.setStatus(booking.id,success?'cancelled':'review');
      console.log(`${booking.reference}: ${success?'calendar entries removed and slots released':'calendar cleanup incomplete; slots remain held'}.`);
    }
  }
}finally{store.close();}
