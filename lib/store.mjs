import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {BookingError} from './domain.mjs';
export class BookingStore {
  constructor(path){
    if(path!==':memory:'){mkdirSync(dirname(path),{recursive:true,mode:0o700});}
    this.db=new DatabaseSync(path);
    if(path!==':memory:')chmodSync(path,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,request_key TEXT UNIQUE NOT NULL,digest TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(booking_id TEXT NOT NULL REFERENCES bookings(id),teacher_id TEXT NOT NULL,start TEXT NOT NULL,end TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_teacher ON sessions(teacher_id,start,end);`);
  }
  digest(body){const copy={...body};delete copy.requestId;return createHash('sha256').update(JSON.stringify(copy)).digest('hex');}
  existing(key){const row=this.db.prepare('SELECT * FROM bookings WHERE request_key=?').get(key);return row?{...JSON.parse(row.payload),status:row.status,digest:row.digest}:null;}
  busy(teacherId,start,end){return this.db.prepare(`SELECT s.start,s.end FROM sessions s JOIN bookings b ON b.id=s.booking_id WHERE s.teacher_id=? AND s.start<? AND s.end>? AND b.status IN ('pending','review','confirmed')`).all(teacherId,end,start);}
  reserve(body){
    const digest=this.digest(body);this.db.exec('BEGIN IMMEDIATE');
    try{
      const prior=this.existing(body.requestId);
      if(prior){
        if(prior.digest!==digest)throw new BookingError('This request reference was already used for different details. Return to the dates step and try again.',409);
        this.db.exec('COMMIT');return {booking:prior,existing:true};
      }
      const conflicts=body.sessions.filter(s=>this.busy(body.teacherId,s.start,s.end).length).map(s=>s.date);
      if(conflicts.length)throw new BookingError('That teacher has just become unavailable on one or more dates. Choose another shared time.',409,{conflicts});
      const id=randomUUID();const booking={...body,id,reference:'KTC-'+id.slice(0,8).toUpperCase(),createdAt:new Date().toISOString()};
      this.db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?)').run(id,body.requestId,digest,'pending',JSON.stringify(booking),booking.createdAt);
      const insert=this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)');for(const s of booking.sessions)insert.run(id,body.teacherId,s.start,s.end);
      this.db.exec('COMMIT');return {booking:{...booking,status:'pending'},existing:false};
    }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  }
  setStatus(id,status){this.db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status,id);}
  unresolved(){return this.db.prepare("SELECT payload,status FROM bookings WHERE status IN ('pending','review')").all().map(row=>({...JSON.parse(row.payload),status:row.status}));}
  byReference(reference){const row=this.db.prepare("SELECT payload,status FROM bookings WHERE json_extract(payload,'$.reference')=?").get(reference);return row?{...JSON.parse(row.payload),status:row.status}:null;}
  close(){this.db.close();}
}
