import {PROGRAMS,addDays,slotsForDay,instant,clock,minutes,overlap,manilaDay,HORIZON_DAYS} from '../shared.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {BookingError,validateBooking,validateAttachments,selectTeacher,validateDates} from './domain.mjs';
import {teacherEmail,parentScheduleEmail} from './mailer.mjs';
export function receipt(booking){return {id:booking.id,reference:booking.reference,preview:false,programName:booking.programName,teacherName:booking.teacherName,lessonMinutes:booking.lessonMinutes,time:booking.time,online:booking.branch==='online',rate:booking.rate,total:booking.total,paid:booking.paid,sessions:booking.sessions};}
export class BookingService {
  constructor(config,store,calendar,{mailer,uploadsDir}={}){this.config=config;this.store=store;this.calendar=calendar;this.mailer=mailer;this.uploadsDir=uploadsDir;}
  async availability(query,now=new Date()){
    const {teacher,program}=selectTeacher(this.config,query.teacher,query.program,query.branch);
    if(typeof query.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)||query.month<manilaDay(now).slice(0,7)||query.month>addDays(manilaDay(now),HORIZON_DAYS).slice(0,7))throw new BookingError('Choose a month within the next 180 days.');
    const selected=query.dates?validateDates(query.dates.split(','),0,now):[];
    const [y,m]=query.month.split('-').map(Number);const first=query.month+'-01',last=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
    const all=new Set(selected);for(let d=first;d<=last;d=addDays(d,1))all.add(d);
    const days=[...all].sort();const start=instant(days[0],'00:00').toISOString(),end=instant(addDays(days.at(-1),1),'00:00').toISOString();
    const busy=[...this.store.busy(teacher.id,start,end),...await this.calendar.busy(teacher.id,start,end)].map(b=>({start:Date.parse(b.start),end:Date.parse(b.end)}));
    const available={};for(const day of days)available[day]=slotsForDay(teacher,program,day,now,this.config.leadMinutes).filter(t=>{const s=instant(day,t).getTime();return !busy.some(b=>overlap(s,s+program.slotMinutes*60000,b.start,b.end));});
    return {dates:Object.fromEntries(days.filter(d=>d>=first&&d<=last).map(d=>[d,available[d]])),common:selected.length?available[selected[0]].filter(t=>selected.every(d=>available[d].includes(t))):[]};
  }
  async book(body,now=new Date()){
    const files=validateAttachments(body.attachments);
    const valid={...validateBooking(body,this.config,now),paid:files.some(f=>f.kind==='receipt'),attachments:files.map(({data,...meta})=>meta)};
    const {booking,existing}=this.store.reserve(valid);
    if(existing){
      if(booking.status==='confirmed')return receipt(booking);
      if(booking.status==='failed')throw new BookingError('This attempt was not confirmed. Return to the dates step and choose your time again to submit a new request.',409);
      throw new BookingError('This request is awaiting calendar verification. Please contact the center before making another booking.',409,{reference:booking.reference});
    }
    // Keep uploads (especially payment receipts) even if the calendar step fails.
    if(this.uploadsDir&&files.length){const dir=join(this.uploadsDir,booking.id);await mkdir(dir,{recursive:true,mode:0o700});await Promise.all(files.map((f,i)=>writeFile(join(dir,`${i+1}-${f.kind}-${f.name}`),f.data,{mode:0o600})));}
    let calendarWriteStarted=false;
    try{
      const busy=await this.calendar.busy(booking.teacherId,booking.sessions[0].start,booking.sessions.at(-1).end);
      const conflicts=booking.sessions.filter(s=>busy.some(b=>overlap(Date.parse(s.start),Date.parse(s.end),Date.parse(b.start),Date.parse(b.end)))).map(s=>s.date);
      if(conflicts.length)throw new BookingError('One or more dates are no longer available at that time. Choose another time or adjust your dates.',409,{conflicts});
      calendarWriteStarted=true;
      if(booking.branch==='online'){
        const invite=await this.calendar.createInvite(booking);
        if(!invite.hangoutLink)throw new BookingError('Google Meet could not be created. No sessions were confirmed. Please try again.',503);
        booking.meetLink=invite.hangoutLink;for(const session of booking.sessions)session.meetLink=invite.hangoutLink;
      }
      for(const session of booking.sessions)await this.calendar.create(booking,session);
      this.store.setStatus(booking.id,'confirmed',booking);
      await this.notify(booking,files);
      return receipt(booking);
    }catch(error){
      // A timeout or server error can leave an in-flight insert at Google. Keep
      // the hold for reconciliation even if a subsequent delete returns 404.
      let safe=!calendarWriteStarted || (Number.isInteger(error.status) && error.status < 500);
      if(calendarWriteStarted){
        // Try every deterministic event ID, including a write whose response timed out.
        for(const session of booking.sessions){try{await this.calendar.remove(booking,session);}catch{safe=false;}}
        if(booking.branch==='online'){try{await this.calendar.removeInvite(booking);}catch{safe=false;}}
      }
      this.store.setStatus(booking.id,safe?'failed':'review');
      if(!safe)throw new BookingError('We could not verify the full calendar update. Your request is not confirmed. Please contact the center before trying again.',503,{reference:booking.reference});
      if(error instanceof BookingError)throw error;
      throw new BookingError('Google Calendar is temporarily unavailable. No sessions were confirmed. Please return to dates and try again.',503);
    }
  }
  // Email failures never undo a confirmed calendar booking; they are logged for the center to follow up.
  async notify(booking,files){
    if(!this.mailer){console.warn('Booking emails skipped: center Gmail is not connected.');return;}
    const messages=[teacherEmail(booking,booking.teacherEmail,files)];
    messages.push(parentScheduleEmail(booking));
    for(const message of messages){try{await this.mailer.send(message);}catch(error){console.error('Booking email failed:',booking.reference,error.message);}}
  }

}
