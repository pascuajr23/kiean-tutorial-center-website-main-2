import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {BRANCHES,peso,dateLabel,slotLabel} from '../shared.mjs';
// The center Gmail account is stored beside teacher tokens under an id teacher ids cannot use.
export const CENTER_ID='__center__';
const LOGO=readFileSync(new URL('../assets/kiean-logo.png',import.meta.url));
const wrap=buffer=>buffer.toString('base64').replace(/.{76}/g,'$&\r\n');
const header=text=>`=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`;
const boundary=()=>'kiean-'+randomBytes(12).toString('hex');
const part=(type,data,extra='')=>`Content-Type: ${type}${extra}\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(data)}`;
const multipart=(type,parts)=>{const b=boundary();return `Content-Type: multipart/${type}; boundary="${b}"\r\n\r\n`+parts.map(p=>`--${b}\r\n${p}\r\n`).join('')+`--${b}--`;};
export function mime({to,subject,text,html,attachments=[]}){
  // mixed[ related[ alternative[text, html], inline logo ], attachments... ]
  let body=part('text/plain; charset=UTF-8',Buffer.from(text));
  if(html)body=multipart('related',[multipart('alternative',[body,part('text/html; charset=UTF-8',Buffer.from(html))]),part('image/png',LOGO,'; name="kiean-logo.png"\r\nContent-ID: <kiean-logo>\r\nContent-Disposition: inline; filename="kiean-logo.png"')]);
  const files=attachments.map(f=>part(f.type,f.data,`; name="${f.name}"\r\nContent-Disposition: attachment; filename="${f.name}"`));
  return `To: ${to}\r\nSubject: ${header(subject)}\r\nMIME-Version: 1.0\r\n`+multipart('mixed',[body,...files])+'\r\n';
}
export class GmailMailer {
  constructor({calendar,fetcher=fetch}){this.calendar=calendar;this.fetcher=fetcher;}
  async send(message){
    const response=await this.fetcher('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media',{method:'POST',headers:{Authorization:'Bearer '+await this.calendar.token(CENTER_ID),'Content-Type':'message/rfc822'},body:mime(message),signal:AbortSignal.timeout(30000)});
    if(!response.ok){
      if(response.status===401)this.calendar.clearToken(CENTER_ID);
      let reason='';try{reason=(await response.json()).error?.message||'';}catch{}
      throw new Error(`Gmail send failed (${response.status}). ${reason}`.trim());
    }
  }
}

// Website palette (style.css :root).
const C={blue:'#123B8E',blueDeep:'#061B46',blueLight:'#EAF1FF',orange:'#F47A20',orangeLight:'#FFF0E5',green:'#2F7D32',greenLight:'#EFF9DF',text:'#26344D',muted:'#6B7688',border:'#E1E6EF',offWhite:'#FFFCF7'};
const FONT="'Nunito','DM Sans',Arial,Helvetica,sans-serif";
export const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const placeName=booking=>booking.branch==='online'?'Online · Google Meet':BRANCHES.find(b=>b.id===booking.branch)?.name||booking.branch;
const firstDay=booking=>dateLabel(booking.sessions[0].date);
const lessonLabel=booking=>slotLabel(booking.time,booking.lessonMinutes);
function layout({kicker,title,intro,rows,booking,payment,footerNote}){
  const detail=rows.map(([label,value])=>`<tr><td style="padding:7px 0;color:${C.muted};font-size:13px;width:150px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:7px 0;color:${C.text};font-size:14px;font-weight:700">${escapeHtml(value)}</td></tr>`).join('');
  const schedule=booking.sessions.map((s,i)=>`<tr style="background:${i%2?'#ffffff':C.blueLight}"><td style="padding:10px 14px;color:${C.muted};font-size:12px;width:28px">${i+1}</td><td style="padding:10px 6px;color:${C.text};font-size:14px;font-weight:700">${escapeHtml(dateLabel(s.date))}</td><td style="padding:10px 6px;color:${C.blue};font-size:13px;font-weight:700">${escapeHtml(lessonLabel(booking))}</td><td style="padding:10px 14px;text-align:right">${s.meetLink?`<a href="${escapeHtml(s.meetLink)}" style="display:inline-block;padding:6px 12px;border-radius:999px;background:${C.blue};color:#ffffff;font-size:12px;font-weight:700;text-decoration:none">Join Meet</a>`:''}</td></tr>`).join('');
  const paid=booking.paid;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:${C.offWhite}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.offWhite};font-family:${FONT}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${C.border}">
<tr><td style="padding:22px 28px;border-bottom:4px solid ${C.orange}"><img src="cid:kiean-logo" alt="KieAn Tutorial Center" width="150" style="display:block;width:150px;height:auto"></td></tr>
<tr><td style="padding:28px 28px 8px"><div style="color:${C.orange};font-size:11px;font-weight:900;letter-spacing:2px">${escapeHtml(kicker)}</div><h1 style="margin:10px 0 8px;color:${C.blueDeep};font-size:26px;line-height:1.2">${escapeHtml(title)}</h1><p style="margin:0;color:${C.muted};font-size:14px;line-height:1.7">${escapeHtml(intro)}</p></td></tr>
<tr><td style="padding:16px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detail}</table></td></tr>
<tr><td style="padding:0 28px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.blue};border-radius:12px"><tr><td style="padding:16px 20px;color:#C8D9F3;font-size:12px;font-weight:700;letter-spacing:1px">TOTAL<div style="margin-top:4px;color:#C8D9F3;font-size:12px;font-weight:400;letter-spacing:0">${booking.sessions.length} sessions × ${escapeHtml(peso(booking.rate))}</div></td><td style="padding:16px 20px;text-align:right;color:#ffffff;font-size:26px;font-weight:900">${escapeHtml(peso(booking.total))}</td></tr></table>
<div style="margin-top:12px;padding:12px 16px;border-radius:10px;background:${paid?C.greenLight:C.orangeLight};color:${paid?C.green:'#B4570F'};font-size:13px;font-weight:700">${escapeHtml(payment)}</div></td></tr>
<tr><td style="padding:4px 28px 8px"><div style="color:${C.blue};font-size:13px;font-weight:900;letter-spacing:1px">SCHEDULE · PHILIPPINE TIME</div></td></tr>
<tr><td style="padding:0 28px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:10px;overflow:hidden">${schedule}</table></td></tr>
<tr><td style="padding:18px 28px;background:${C.blueDeep};color:#C8D9F3;font-size:12px;line-height:1.7">${escapeHtml(footerNote)}<br><strong style="color:${C.orange}">We care to learn.</strong> · KieAn Tutorial Center</td></tr>
</table></td></tr></table></body></html>`;
}
const textSchedule=booking=>booking.sessions.map((s,i)=>`${i+1}. ${dateLabel(s.date)} · ${lessonLabel(booking)}${s.meetLink?` · Google Meet: ${s.meetLink}`:''}`).join('\n');
export function teacherEmail(booking,teacherAddress,files){
  const payment=booking.paid?'PAID — payment receipt attached':'NOT YET PAID — no receipt uploaded';
  const rows=[['Reference',booking.reference],['Program',booking.programName],['Location',placeName(booking)],['Learner',`${booking.studentName} (${booking.grade})`],['Parent/guardian',booking.parentName],['Email',booking.email],['Contact',booking.phone],['Learning request',booking.notes||'None supplied'],...(files.length?[['Attached files',files.map(f=>f.name+(f.kind==='receipt'?' (receipt)':'')).join(', ')]]:[])];
  return {to:teacherAddress,attachments:files,
    subject:`${firstDay(booking)} · New schedule starts · ${booking.programName} · ${booking.studentName} · ${booking.paid?'PAID':'UNPAID'}`,
    text:`Hello ${booking.teacherName},\n\nA new schedule starting ${firstDay(booking)} was added to your Google Calendar.\n\n${rows.map(([k,v])=>`${k}: ${v}`).join('\n')}\n\nPayment: ${payment}\nTotal: ${peso(booking.total)} (${booking.sessions.length} sessions × ${peso(booking.rate)})\n\nSchedule (Philippine Time):\n${textSchedule(booking)}\n\n— KieAn Tutorial Center booking system`,
    html:layout({kicker:'NEW SCHEDULE',title:`Starts ${firstDay(booking)}`,intro:`Hello ${booking.teacherName}, a new ${booking.sessions.length}-session booking was added to your Google Calendar.`,rows,booking,payment,footerNote:'This booking is already on your Google Calendar. Uploaded files are attached to this email.'})};
}
export function parentScheduleEmail(booking){
  const payment=booking.paid?'Receipt received — the center will verify your payment.':'Not yet paid — please settle the fee with the center before the first session.';
  const rows=[['Reference',booking.reference],['Learner',booking.studentName],['Program',booking.programName],['Teacher',booking.teacherName],['Branch',placeName(booking)]];
  return {to:booking.email,
    subject:`${firstDay(booking)} · Your KieAn schedule starts · ${booking.programName} · ${booking.reference}`,
    text:`Hello ${booking.parentName},\n\nThank you for booking with KieAn Tutorial Center. ${booking.studentName}'s schedule starts ${firstDay(booking)}.\n\n${rows.map(([k,v])=>`${k}: ${v}`).join('\n')}\n\nSchedule (Philippine Time):\n${textSchedule(booking)}\n\nTotal: ${peso(booking.total)} (${booking.sessions.length} sessions × ${peso(booking.rate)})\nPayment: ${payment}\n\nFor changes, message KieAn Tutorial Center on Facebook and quote your reference.\n\nWe care to learn.\nKieAn Tutorial Center`,
    html:layout({kicker:'YOUR SCHEDULE',title:`Starts ${firstDay(booking)}`,intro:`Hello ${booking.parentName}, thank you for booking with KieAn. Here is ${booking.studentName}'s full schedule.`,rows,booking,payment,footerNote:'For changes, message KieAn Tutorial Center on Facebook and quote your reference.'})};
}
// Google Calendar descriptions accept simple HTML (b, br, a, ul, li).
export function inviteDescription(booking){
  return `<b>KieAn Tutorial Center · ${escapeHtml(booking.programName)}</b><br>Learner: ${escapeHtml(booking.studentName)} (${escapeHtml(booking.grade)})<br>Teacher: ${escapeHtml(booking.teacherName)}<br>Reference: ${escapeHtml(booking.reference)}<br><br><b>Join every session with the same Google Meet link above.</b><br><br><b>Schedule (Philippine Time)</b><ul>${booking.sessions.map(s=>`<li>${escapeHtml(dateLabel(s.date))} · ${escapeHtml(lessonLabel(booking))}</li>`).join('')}</ul>Total: ${escapeHtml(peso(booking.total))} · ${booking.paid?'Receipt received':'Not yet paid'}<br><br>For changes, message KieAn Tutorial Center on Facebook.<br><i>We care to learn.</i>`;
}
