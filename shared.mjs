export const TIME_ZONE = 'Asia/Manila';
export const MAX_SESSIONS = 40;
export const HORIZON_DAYS = 180;
export const PROGRAMS = [
  { id: 'online', name: 'Online Tutorial', mode: 'online', minSessions: 5, rate: 200, lessonMinutes: 50, slotMinutes: 60, price: 'Fees confirmed by the center', note: 'Nursery to Grade 6 · One-to-one' },
  { id: 'academic', name: 'Academic Tutorial', mode: 'branch', minSessions: 20, rate: 150, lessonMinutes: 60, slotMinutes: 60, price: '₱3,000 / 20 sessions', note: 'Nursery to Grade 6 · 2 learners : 1 teacher' },
  { id: 'after-school', name: 'After School Tutorial', mode: 'branch', minSessions: 20, rate: 150, lessonMinutes: 60, slotMinutes: 60, price: '₱3,000 / 20 sessions', note: 'Nursery to Grade 6 · 2 learners : 1 teacher' },
  { id: 'sped', name: 'SPED / SNED Tutorial', mode: 'branch', minSessions: 20, rate: 300, lessonMinutes: 60, slotMinutes: 60, price: '₱6,000 / 20 sessions · ₱3,900 / 12 sessions', note: 'Nursery to Grade 6 · One-to-one' }
];
// Per-session rates: package price ÷ 20 sessions (portfolio pp. 6–8); San Pedro has its own rates (p. 32).
const BRANCH_RATES = {'san-pedro': {academic: 250, sped: 400}};
export const sessionRate = (programId, branch) => BRANCH_RATES[branch]?.[programId] ?? PROGRAMS.find(p => p.id === programId).rate;
export const peso = amount => '₱' + amount.toLocaleString('en-PH');
export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_REQUEST_FILES = 3;
// A working period may be limited to a kind of lesson: [start, end] or [start, end, type].
export const PERIOD_TYPES = [
  {id: 'any', label: 'Any program'},
  {id: 'online', label: 'Online only'},
  {id: 'f2f', label: 'Face to face only'},
  {id: 'sped', label: 'SPED face to face only'}
];
export function periodAllows(type = 'any', program) {
  return type === 'any' || (type === 'online' && program.mode === 'online') || (type === 'f2f' && program.mode === 'branch') || (type === 'sped' && program.id === 'sped');
}
export const BRANCHES = [
  {id:'san-pedro',name:'San Pedro, Laguna'}, {id:'pila',name:'Pila, Laguna'},
  {id:'natania',name:'Natania Homes'}, {id:'south-square',name:'South Square'},
  {id:'san-francisco',name:'San Francisco'}, {id:'maliksi',name:'Maliksi Heroes-Town'},
  {id:'naic',name:'Ciudad Nuevo, Naic'}
];
export const PREVIEW_TEACHERS = [
  {id:'preview-teacher',name:'Sample teacher',bio:'Preview schedule only. The center will add its teachers before bookings open.',programs:PROGRAMS.map(p=>p.id),branches:['online', ...BRANCHES.map(b=>b.id)],weekly:{1:[['09:00','17:00']],2:[['09:00','17:00']],3:[['09:00','17:00']],4:[['09:00','17:00']],5:[['09:00','17:00']]},blackoutDates:[]}
];
export function manilaDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function addDays(day, n) { return new Date(Date.parse(day+'T12:00:00Z') + n*86400000).toISOString().slice(0,10); }
export function validDate(day) { return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day+'T12:00:00Z')) && new Date(day+'T12:00:00Z').toISOString().slice(0,10) === day; }
export function weekday(day) { return new Date(day+'T12:00:00Z').getUTCDay(); }
export function minutes(time) { return Number(time.slice(0,2))*60 + Number(time.slice(3)); }
export function clock(n) { return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'); }
export function instant(day,time) { return new Date(day+'T'+time+':00+08:00'); }
export function timeLabel(time) { const m=minutes(time); return `${Math.floor(m/60)%12||12}:${String(m%60).padStart(2,'0')} ${m<720?'AM':'PM'}`; }
export function slotLabel(time,duration=60) { return `${timeLabel(time)} – ${timeLabel(clock(minutes(time)+duration))}`; }
export function dateLabel(day,short=false) { return new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',...(short?{}:{year:'numeric'})}).format(new Date(day+'T12:00:00Z')); }
export function slotsForDay(teacher,program,day,now=new Date(),leadMinutes=60) {
  if (!validDate(day) || day < manilaDay(now) || day > addDays(manilaDay(now),HORIZON_DAYS) || teacher.blackoutDates?.includes(day)) return [];
  if (program.mode === 'branch' && [0,6].includes(weekday(day))) return [];
  const slots=[];
  for(const [start,end,type] of teacher.weekly[weekday(day)] || []) {
    if(!periodAllows(type,program)) continue;
    for(let n=Math.ceil(minutes(start)/60)*60;n+program.slotMinutes<=minutes(end);n+=60) {
      const t=clock(n);
      if(instant(day,t).getTime() >= now.getTime()+leadMinutes*60000) slots.push(t);
    }
  }
  return [...new Set(slots)].sort();
}
export function overlap(a,b,c,d) { return a<d && b>c; }
export function icsForBooking(booking) {
  const esc=value=>String(value).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const stamp=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//KieAn Tutorial Center//Booking//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  for(const session of booking.sessions) lines.push('BEGIN:VEVENT',`UID:${booking.id}-${session.date}@kiean-booking`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(session.start)}`,`DTEND:${stamp(session.end)}`,`SUMMARY:${esc((booking.preview?'PREVIEW — ':'')+'KieAn '+booking.programName)}`,`DESCRIPTION:${esc(booking.teacherName+' · '+booking.lessonMinutes+'-minute lesson. '+(booking.preview?'This is a preview, not a booking.':'Booking reference: '+booking.reference))}`,'END:VEVENT');
  lines.push('END:VCALENDAR');
  // RFC 5545: fold at 75 UTF-8 octets, never splitting a code point.
  return lines.map(line=>{let out='',len=0;for(const ch of line){const size=new TextEncoder().encode(ch).length;if(len+size>75){out+='\r\n ';len=1;}out+=ch;len+=size;}return out;}).join('\r\n')+'\r\n';
}
