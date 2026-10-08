import {readFileSync} from 'node:fs';
import {createSign,createHash} from 'node:crypto';
const BASE='https://www.googleapis.com/calendar/v3';
export class CalendarError extends Error {constructor(message,status=503){super(message);this.status=status;}}
export class GoogleCalendar {
  constructor(credentials,fetcher=fetch){this.credentials=credentials;this.fetcher=fetcher;this.accessToken=null;this.expires=0;}
  static fromEnvironment(){return new GoogleCalendar(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8')));}
  async token(){
    if(this.accessToken&&Date.now()<this.expires)return this.accessToken;
    const c=this.credentials,now=Math.floor(Date.now()/1000);
    const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const claim=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:c.client_email,scope:'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
    const signer=createSign('RSA-SHA256');signer.update(claim);signer.end();const assertion=claim+'.'+signer.sign(c.private_key,'base64url');
    const response=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok||!data.access_token)throw new CalendarError('Google Calendar authentication failed.');
    this.accessToken=data.access_token;this.expires=Date.now()+(Number(data.expires_in)-60)*1000;return this.accessToken;
  }
  async request(path,method='GET',body){
    const response=await this.fetcher(BASE+path,{method,headers:{Authorization:'Bearer '+await this.token(),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    if(response.status===204)return {};
    let data;try{data=await response.json();}catch{throw new CalendarError('Google Calendar returned an invalid response.');}
    if(!response.ok){if(response.status===401){this.accessToken=null;this.expires=0;}throw new CalendarError('Google Calendar request failed.',response.status);}
    return data;
  }
  async busy(calendarId,start,end){
    const response=await this.request('/freeBusy','POST',{timeMin:start,timeMax:end,timeZone:'Asia/Manila',items:[{id:calendarId}]});
    const calendar=response.calendars?.[calendarId];
    if(!calendar||calendar.errors?.length||!Array.isArray(calendar.busy)||calendar.busy.some(b=>!Number.isFinite(Date.parse(b.start))||!Number.isFinite(Date.parse(b.end))))throw new CalendarError('Teacher availability could not be verified.');
    return calendar.busy;
  }
  eventId(booking,date){return createHash('sha256').update('kiean:'+booking.id+':'+date).digest('hex');}
  async create(booking,session){
    const id=this.eventId(booking,session.date);
    const resource={id,summary:`KieAn ${booking.programName} · ${booking.reference}`,description:`Booking: ${booking.reference}\nTeacher: ${booking.teacherName}\nLearner: ${booking.studentName} (${booking.grade})\nParent/guardian: ${booking.parentName}\nEmail: ${booking.email}\nContact: ${booking.phone}\nLearning request: ${booking.notes||'None supplied'}\nLesson: ${booking.lessonMinutes} minutes${booking.lessonMinutes<booking.slotMinutes?', plus '+(booking.slotMinutes-booking.lessonMinutes)+' minutes between lessons':''}.\nAll times: Philippine Time (Asia/Manila).`,location:booking.branch==='online'?'Online — lesson access details provided by KieAn':booking.branch,start:{dateTime:session.start,timeZone:'Asia/Manila'},end:{dateTime:session.end,timeZone:'Asia/Manila'},transparency:'opaque',visibility:'private',extendedProperties:{private:{kieanBooking:booking.id}},reminders:{useDefault:true}};
    try{return await this.request(`/calendars/${encodeURIComponent(booking.calendarId)}/events?sendUpdates=none`,'POST',resource);}
    catch(error){
      if(error.status!==409)throw error;
      const existing=await this.request(`/calendars/${encodeURIComponent(booking.calendarId)}/events/${id}`);
      if(existing.status==='cancelled'||existing.extendedProperties?.private?.kieanBooking!==booking.id||Date.parse(existing.start?.dateTime)!==Date.parse(session.start)||Date.parse(existing.end?.dateTime)!==Date.parse(session.end))throw new CalendarError('Calendar event mismatch.');
      return existing;
    }
  }
  async remove(booking,session){
    try{await this.request(`/calendars/${encodeURIComponent(booking.calendarId)}/events/${this.eventId(booking,session.date)}?sendUpdates=none`,'DELETE');}
    catch(error){if(![404,410].includes(error.status))throw error;}
  }
}
