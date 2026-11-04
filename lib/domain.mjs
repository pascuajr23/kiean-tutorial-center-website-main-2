import {createHash} from 'node:crypto';
import {PROGRAMS,bookable,AREAS,branchById,areaBranches,offers,teacherServes,seatsAt,sessionRate,careTiming,kiddieQuote,weekday,ATTACHMENT_TYPES,MAX_ATTACHMENT_BYTES,MAX_REQUEST_FILES,MAX_SESSIONS,HORIZON_DAYS,manilaDay,addDays,validDate,slotsForDay,clock,minutes,instant} from '../shared.mjs';
export class BookingError extends Error {
  constructor(message,status=400,details={}){super(message);this.status=status;this.details=details;}
}
export function selectTeacher(config,teacherId,programId,branchId){
  const program=PROGRAMS.find(p=>p.id===programId);
  const teacher=config.teachers.find(t=>t.id===teacherId);
  if(!bookable(program)||!teacher||teacher.available===false||!teacher.programs.includes(programId))throw new BookingError('Please select an available teacher and program.');
  const branch=program.mode==='online'?'online':branchId;
  if((program.mode==='online'&&branchId!=='online')||!teacher.branches.includes(branch)||!(branch==='online'||branchById(config.branches,branch))||!offers(config.branches,branch,program.id))throw new BookingError('This teacher does not offer the selected program at this location.');
  return {teacher,program,branch};
}
function clean(value,label,max,min=1){
  if(typeof value!=='string'||value.trim().length<min||value.trim().length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw new BookingError(`Please enter a valid ${label}.`);
  return value.trim();
}
export function validateDates(dates,minimum,now=new Date(),maximum=MAX_SESSIONS){
  if(!Array.isArray(dates)||dates.length<minimum||dates.length>maximum)throw new BookingError(minimum===maximum?`Choose ${minimum} class dates.`:`Choose between ${minimum} and ${maximum} different session dates.`);
  if(new Set(dates).size!==dates.length)throw new BookingError('Each session must have a different date.');
  const today=manilaDay(now),last=addDays(today,HORIZON_DAYS);
  if(dates.some(d=>!validDate(d)||d<today||d>last))throw new BookingError('Choose valid dates within the next 180 days.');
  return [...dates].sort();
}
// Kiddie Care bookings pick 1, 4, 6 or 8 hours; every other program has a fixed length.
// Kiddie Care: care type and hours set the slot; plan, child needs and tutorial set the price (days=0 skips pricing).
export function careBooking(program,body,days){
  try{
    const timing=careTiming(program,body);
    return {...timing,quote:program.care&&days?kiddieQuote({...body,days}):null};
  }catch(error){throw new BookingError(error.message);}
}
export function validateBooking(body,config,now=new Date()){
  if(!body||typeof body!=='object')throw new BookingError('Invalid booking.');
  if(body.website)throw new BookingError('Unable to process this submission.');
  if(typeof body.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId))throw new BookingError('Invalid request reference. Reload the booking page.');
  const {teacher,program,branch}=selectTeacher(config,body.teacher,body.program,body.branch);
  const area=AREAS.find(a=>a.id===body.area);
  if(program.mode==='branch'&&!areaBranches(config.branches,area?.id).includes(branch))throw new BookingError('This branch does not serve your area. Choose a branch for your area.');
  if(program.mode==='online'&&!teacherServes(teacher,area?.id,config.branches))throw new BookingError('This online teacher does not serve your area. Choose a teacher for your area.');
  const monthly=program.care&&body.plan==='monthly';
  const dates=validateDates(body.dates,monthly?20:program.minSessions,now,monthly?20:program.maxSessions);
  if(monthly&&dates.some(d=>[0,6].includes(weekday(d))))throw new BookingError('Monthly packages cover 20 school days, Monday to Friday.');
  const {length,periodType,quote}=careBooking(program,body,dates.length);
  if(typeof body.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time))throw new BookingError('Choose one shared time slot.');
  if(dates.some(d=>!slotsForDay(teacher,program,d,now,config.leadMinutes,length,periodType).includes(body.time)))throw new BookingError('The selected time is outside this teacher’s working hours or too close to the start time.');
  if(body.consent!==true)throw new BookingError('Parent or guardian consent is required.');
  const parentName=clean(body.parentName,'parent or guardian name',100,2),email=clean(body.email,'email address',200).toLowerCase(),phone=clean(body.phone,'contact number',30,7),studentName=clean(body.studentName,'learner’s first name',80);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^\+?[\d\s().-]{7,30}$/.test(phone))throw new BookingError('Please check your email address and contact number.');
  if(!['Toddler','Nursery','Kindergarten','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'].includes(body.grade))throw new BookingError('Choose a grade from Toddler to Grade 6.');
  const notes=clean(body.notes||'','learning request',350,0);
  const place=branchById(config.branches,branch),rate=sessionRate(program.id,place);
  return {requestId:body.requestId,teacherId:teacher.id,teacherName:teacher.name,teacherEmail:teacher.googleEmail,programId:program.id,programName:program.name,branch,lessonMinutes:program.care?length:program.lessonMinutes,slotMinutes:length,...(quote&&{care:body.care,needs:body.needs,hours:length/60,plan:monthly?'monthly':'per-day',tutorial:body.tutorial===true||body.tutorial==='true',priceNote:quote.summary}),area:area?.name,branchName:place?.name,branchAddress:place?.address,time:body.time,parentName,email,phone,studentName,grade:body.grade,notes,consent:true,dates,rate,total:quote?quote.total:rate==null?null:rate*dates.length,sessions:dates.map(date=>({date,start:instant(date,body.time).toISOString(),end:new Date(instant(date,body.time).getTime()+length*60000).toISOString(),seats:seatsAt(teacher,program,date,body.time,periodType)}))};
}
// File signatures, so a renamed executable cannot pass as an image or PDF.
const SIGNATURES={'image/jpeg':b=>b[0]===0xff&&b[1]===0xd8&&b[2]===0xff,'image/png':b=>b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),'image/webp':b=>b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP','application/pdf':b=>b.toString('latin1',0,5)==='%PDF-'};
export function validateAttachments(list){
  if(list===undefined)return [];
  if(!Array.isArray(list))throw new BookingError('Invalid attachments.');
  const files=list.map(file=>{
    if(!file||!['request','receipt'].includes(file.kind)||!ATTACHMENT_TYPES.includes(file.type)||typeof file.data!=='string'||typeof file.name!=='string')throw new BookingError('Attachments must be JPG, PNG, WebP or PDF files.');
    const data=Buffer.from(file.data,'base64');
    if(!data.length||data.length>MAX_ATTACHMENT_BYTES)throw new BookingError('Each attachment must be 5 MB or smaller.',413);
    if(!SIGNATURES[file.type](data))throw new BookingError('An attachment does not match its file type.');
    const name=file.name.replace(/[^\w.\- ()]/g,'_').slice(-100)||'attachment';
    return {kind:file.kind,name,type:file.type,size:data.length,sha256:createHash('sha256').update(data).digest('hex'),data};
  });
  if(files.filter(f=>f.kind==='request').length>MAX_REQUEST_FILES||files.filter(f=>f.kind==='receipt').length>1)throw new BookingError(`Attach up to ${MAX_REQUEST_FILES} files and one receipt.`);
  return files;
}
