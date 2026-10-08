import {resolve} from 'node:path';
import {loadConfig} from '../lib/config.mjs';
import {BookingStore} from '../lib/store.mjs';
import {GoogleCalendar} from '../lib/calendar.mjs';
import {GoogleOAuth} from '../lib/google-oauth.mjs';
const config=loadConfig();
if(config.preview)throw new Error('Set mode to live and configure teachers first.');
const store=new BookingStore(resolve(process.env.KIEAN_DATA_DIR||'data','bookings.sqlite'),{tokenEncryptionKey:process.env.KIEAN_TOKEN_ENCRYPTION_KEY});
const oauth=new GoogleOAuth({clientId:process.env.GOOGLE_OAUTH_CLIENT_ID,clientSecret:process.env.GOOGLE_OAUTH_CLIENT_SECRET,redirectUri:`${config.publicOrigin}/api/google/callback`});
const calendar=new GoogleCalendar({store,oauth});
try{
  for(const teacher of config.teachers){
    await calendar.busy(teacher.id,new Date().toISOString(),new Date(Date.now()+86400000).toISOString());
    console.log(`${teacher.name}: Calendar availability is readable.`);
  }
  console.log('No events were created. Verify one live test booking before opening bookings to parents.');
}finally{store.close();}
