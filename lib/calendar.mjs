import {createHash} from 'node:crypto';
import {peso,clock,minutes} from '../shared.mjs';
import {CENTER_ID,inviteDescription} from './mailer.mjs';
const BASE='https://www.googleapis.com/calendar/v3';
class CalendarError extends Error {constructor(message,status=503){super(message);this.status=status;}}
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
    const resource={id,summary:`KieAn ${booking.programName} · ${booking.reference}`,description:`Booking: ${booking.reference}\nTeacher: ${booking.teacherName}\nLearner: ${booking.studentName} (${booking.grade})\nParent/guardian: ${booking.parentName}\nEmail: ${booking.email}\nContact: ${booking.phone}\nLearning request: ${booking.notes||'None supplied'}\nPayment: ${booking.paid?'Paid (receipt received)':'Not yet paid'} · Total ${peso(booking.total)} for ${booking.sessions.length} sessions\nLesson: ${booking.lessonMinutes} minutes${booking.lessonMinutes<booking.slotMinutes?', plus '+(booking.slotMinutes-booking.lessonMinutes)+' minutes between lessons':''}.\nAll times: Philippine Time (Asia/Manila).`,location:booking.branch==='online'?(booking.meetLink?'Google Meet: '+booking.meetLink:'Online'):booking.branch,start:{dateTime:session.start,timeZone:'Asia/Manila'},end:{dateTime:session.end,timeZone:'Asia/Manila'},transparency:'opaque',visibility:'private',extendedProperties:{private:{kieanBooking:booking.id}},reminders:{useDefault:true}};
    if(booking.meetLink)resource.description+=`\nGoogle Meet (same link for every session): ${booking.meetLink}`;
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
  // Online bookings: one invitation from the center calendar covering every date (RDATE), with one Meet link.
  // The parent and teacher are guests, so both can join without being admitted and Google emails the invite.
  inviteId(booking){return createHash('sha256').update('kiean-invite:'+booking.id).digest('hex');}
  async createInvite(booking){
    const id=this.inviteId(booking),[first,...rest]=booking.sessions;
    const local=(date,time)=>`${date}T${time}:00`,end=clock(minutes(booking.time)+booking.lessonMinutes);
    const resource={id,summary:`KieAn Online Tutorial · ${booking.studentName}`,description:inviteDescription(booking),
      start:{dateTime:local(first.date,booking.time),timeZone:'Asia/Manila'},end:{dateTime:local(first.date,end),timeZone:'Asia/Manila'},
      ...(rest.length?{recurrence:['RDATE;TZID=Asia/Manila:'+rest.map(s=>s.date.replaceAll('-','')+'T'+booking.time.replace(':','')+'00').join(',')]}:{}),
      attendees:[{email:booking.email,displayName:booking.parentName},{email:booking.teacherEmail}],guestsCanSeeOtherGuests:false,guestsCanInviteOthers:false,
      conferenceData:{createRequest:{requestId:id,conferenceSolutionKey:{type:'hangoutsMeet'}}},extendedProperties:{private:{kieanBooking:booking.id}},reminders:{useDefault:true}};
    try{return await this.request(CENTER_ID,'/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1','POST',resource);}
    catch(error){
      if(error.status!==409)throw error;
      const existing=await this.request(CENTER_ID,`/calendars/primary/events/${id}`);
      if(existing.status==='cancelled'||existing.extendedProperties?.private?.kieanBooking!==booking.id)throw new CalendarError('Calendar invite mismatch.');
      return existing;
    }
  }
  async removeInvite(booking){
    try{await this.request(CENTER_ID,`/calendars/primary/events/${this.inviteId(booking)}?sendUpdates=all`,'DELETE');}
    catch(error){if(![404,410].includes(error.status))throw error;}
  }

}
