import {PROGRAMS,BRANCHES,MIN_SESSIONS,MAX_SESSIONS,HORIZON_DAYS,manilaDay,addDays,validDate,slotsForDay,clock,minutes,instant} from '../shared.mjs';
export class BookingError extends Error {
  constructor(message,status=400,details={}){super(message);this.status=status;this.details=details;}
}
export function selectTeacher(config,teacherId,programId,branchId){
  const program=PROGRAMS.find(p=>p.id===programId);
  const teacher=config.teachers.find(t=>t.id===teacherId);
  if(!program||!teacher||!teacher.programs.includes(programId))throw new BookingError('Please select an available teacher and program.');
  const branch=program.mode==='online'?'online':branchId;
  if((program.mode==='online'&&branchId!=='online')||!teacher.branches.includes(branch)||!(branch==='online'||BRANCHES.some(b=>b.id===branch)))throw new BookingError('This teacher does not offer the selected program at this location.');
  return {teacher,program,branch};
}
function clean(value,label,max,min=1){
  if(typeof value!=='string'||value.trim().length<min||value.trim().length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw new BookingError(`Please enter a valid ${label}.`);
  return value.trim();
}
export function validateDates(dates,minimum,now=new Date()){
  if(!Array.isArray(dates)||dates.length<minimum||dates.length>MAX_SESSIONS)throw new BookingError(`Choose between ${minimum} and ${MAX_SESSIONS} different session dates.`);
  if(new Set(dates).size!==dates.length)throw new BookingError('Each session must have a different date.');
  const today=manilaDay(now),last=addDays(today,HORIZON_DAYS);
  if(dates.some(d=>!validDate(d)||d<today||d>last))throw new BookingError('Choose valid dates within the next 180 days.');
  return [...dates].sort();
}
export function validateBooking(body,config,now=new Date()){
  if(!body||typeof body!=='object')throw new BookingError('Invalid booking.');
  if(body.website)throw new BookingError('Unable to process this submission.');
  if(typeof body.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId))throw new BookingError('Invalid request reference. Reload the booking page.');
  const {teacher,program,branch}=selectTeacher(config,body.teacher,body.program,body.branch);
  const dates=validateDates(body.dates,MIN_SESSIONS,now);
  if(typeof body.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time))throw new BookingError('Choose one shared time slot.');
  if(dates.some(d=>!slotsForDay(teacher,program,d,now,config.leadMinutes).includes(body.time)))throw new BookingError('The selected time is outside this teacher’s working hours or too close to the start time.');
  if(body.consent!==true)throw new BookingError('Parent or guardian consent is required.');
  const parentName=clean(body.parentName,'parent or guardian name',100,2),email=clean(body.email,'email address',200).toLowerCase(),phone=clean(body.phone,'contact number',30,7),studentName=clean(body.studentName,'learner’s first name',80);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^\+?[\d\s().-]{7,30}$/.test(phone))throw new BookingError('Please check your email address and contact number.');
  if(!['Nursery','Kindergarten','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'].includes(body.grade))throw new BookingError('Choose a grade from Nursery to Grade 6.');
  const notes=clean(body.notes||'','learning request',1000,0);
  return {requestId:body.requestId,teacherId:teacher.id,teacherName:teacher.name,calendarId:teacher.calendarId,programId:program.id,programName:program.name,branch,lessonMinutes:program.lessonMinutes,slotMinutes:program.slotMinutes,time:body.time,parentName,email,phone,studentName,grade:body.grade,notes,consent:true,dates,sessions:dates.map(date=>({date,start:instant(date,body.time).toISOString(),end:instant(date,clock(minutes(body.time)+program.slotMinutes)).toISOString()}))};
}
