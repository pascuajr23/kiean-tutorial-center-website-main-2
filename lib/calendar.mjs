import {createHash} from 'node:crypto';
const BASE='https://www.googleapis.com/calendar/v3';
export class CalendarError extends Error {constructor(message,status=503){super(message);this.status=status;}}
export class GoogleCalendar {
  constructor({store,oauth,fetcher=fetch}){this.store=store;this.oauth=oauth;this.fetcher=fetcher;this.tokens=new Map();}
  async token(teacherId){
    const cached=this.tokens.get(teacherId);
    if(cached&&Date.now()<cached.expires)return cached.accessToken;
    const linked=this.store.googleToken(teacherId);
    if(!linked)throw new CalendarError('This teacher has not connected Google Calendar.');
    let refreshed;
    try{refreshed=await this.oauth.refresh(linked.refreshToken);}catch{throw new CalendarError('Google Calendar authorization expired. Ask the teacher to reconnect.');}
    this.tokens.set(teacherId,{accessToken:refreshed.accessToken,expires:Date.now()+(refreshed.expiresIn-60)*1000});
    return refreshed.accessToken;
  }
  clearToken(teacherId){this.tokens.delete(teacherId);}
  async request(teacherId,path,method='GET',body){
    const response=await this.fetcher(BASE+path,{method,headers:{Authorization:'Bearer '+await this.token(teacherId),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    if(response.status===204)return {};
    let data;try{data=await response.json();}catch{throw new CalendarError('Google Calendar returned an invalid response.');}
    if(!response.ok){if(response.status===401)this.clearToken(teacherId);throw new CalendarError('Google Calendar request failed.',response.status);}
    return data;
  }
  async busy(teacherId,start,end){
    const response=await this.request(teacherId,'/freeBusy','POST',{timeMin:start,timeMax:end,timeZone:'Asia/Manila',items:[{id:'primary'}]});
    const calendar=response.calendars?.primary;
    if(!calendar||calendar.errors?.length||!Array.isArray(calendar.busy)||calendar.busy.some(b=>!Number.isFinite(Date.parse(b.start))||!Number.isFinite(Date.parse(b.end))))throw new CalendarError('Teacher availability could not be verified.');
    return calendar.busy;
  }
  eventId(booking,date){return createHash('sha256').update('kiean:'+booking.id+':'+date).digest('hex');}
  async create(booking,session){
    const id=this.eventId(booking,session.date);
    const resource={id,summary:`KieAn ${booking.programName} · ${booking.reference}`,description:`Booking: ${booking.reference}\nTeacher: ${booking.teacherName}\nLearner: ${booking.studentName} (${booking.grade})\nParent/guardian: ${booking.parentName}\nEmail: ${booking.email}\nContact: ${booking.phone}\nLearning request: ${booking.notes||'None supplied'}\nLesson: ${booking.lessonMinutes} minutes${booking.lessonMinutes<booking.slotMinutes?', plus '+(booking.slotMinutes-booking.lessonMinutes)+' minutes between lessons':''}.\nAll times: Philippine Time (Asia/Manila).`,location:booking.branch==='online'?'Online — lesson access details provided by KieAn':booking.branch,start:{dateTime:session.start,timeZone:'Asia/Manila'},end:{dateTime:session.end,timeZone:'Asia/Manila'},transparency:'opaque',visibility:'private',extendedProperties:{private:{kieanBooking:booking.id}},reminders:{useDefault:true}};
    try{return await this.request(booking.teacherId,`/calendars/primary/events?sendUpdates=none`,'POST',resource);}
    catch(error){
      if(error.status!==409)throw error;
      const existing=await this.request(booking.teacherId,`/calendars/primary/events/${id}`);
      if(existing.status==='cancelled'||existing.extendedProperties?.private?.kieanBooking!==booking.id||Date.parse(existing.start?.dateTime)!==Date.parse(session.start)||Date.parse(existing.end?.dateTime)!==Date.parse(session.end))throw new CalendarError('Calendar event mismatch.');
      return existing;
    }
  }
  async remove(booking,session){
    try{await this.request(booking.teacherId,`/calendars/primary/events/${this.eventId(booking,session.date)}?sendUpdates=none`,'DELETE');}
    catch(error){if(![404,410].includes(error.status))throw error;}
  }
}
