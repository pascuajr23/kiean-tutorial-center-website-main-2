import {loadConfig} from '../lib/config.mjs';
import {GoogleCalendar} from '../lib/calendar.mjs';
const config=loadConfig();
if(config.preview)throw new Error('Set mode to live and configure teachers first.');
const calendar=GoogleCalendar.fromEnvironment();
for(const teacher of config.teachers){
  await calendar.busy(teacher.calendarId,new Date().toISOString(),new Date(Date.now()+86400000).toISOString());
  console.log(`${teacher.name}: Calendar availability is readable.`);
}
console.log('No events were created. Check that the service account has “Make changes to events” permission, then verify one live test booking before opening bookings to parents.');
