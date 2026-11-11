const TIME_ZONE = 'Asia/Manila';
export const MAX_SESSIONS = 40;
export const HORIZON_DAYS = 180;
// Programs are edited in /admin and saved in config.json; these are the defaults a new config starts with.
// Bookable programs have a mode ('online' or 'branch'); info programs (no mode) only show a homepage card.
// homepage: show a card on the homepage · link (info cards): '' = inquire on Facebook, or the id of a bookable program.
export const DEFAULT_PROGRAMS = [
  { id: 'academic', name: 'Academic Tutorial', mode: 'branch', minSessions: 20, rate: 150, lessonMinutes: 60, slotMinutes: 60, price: '₱3,000 / 20 sessions', note: 'Nursery to Grade 6 · 2 learners : 1 teacher', icon: '📖', tagline: 'Achieve academic excellence, one grade at a time', description: 'All subjects, homework and modular assistance, review, advance study, reading and writing.', details: ['Nursery to Grade 6 · 2 learners : 1 teacher', '60 minutes · Monday–Friday'], priceNote: 'San Pedro, Laguna: ₱5,000 / 20 sessions or ₱285 / session · MWF or TTh', linkText: 'Book 20+ sessions →' },
  { id: 'after-school', name: 'After School Tutorial', mode: 'branch', minSessions: 20, rate: 150, lessonMinutes: 60, slotMinutes: 60, price: '₱3,000 / 20 sessions', note: 'Nursery to Grade 6 · 2 learners : 1 teacher', icon: '📚', tagline: 'Achieve academic excellence, one grade at a time', description: 'Guided homework, lessons, reading and writing, with attention to each child’s learning needs.', details: ['Nursery to Grade 6 · 2 learners : 1 teacher', '60 minutes · Monday–Friday'], linkText: 'Book 20+ sessions →' },
  { id: 'sped', name: 'SPED / SNED Tutorial', mode: 'branch', minSessions: 20, rate: 300, lessonMinutes: 60, slotMinutes: 60, price: '₱6,000 / 20 sessions · ₱3,900 / 12 sessions', note: 'Nursery to Grade 6 · One-to-one', icon: '🌟', tagline: 'Achieve academic excellence, one grade at a time', description: 'Activities depend on the developmental pediatrician’s assessment. Parents must present the latest diagnosis directly to the center.', details: ['Nursery to Grade 6 · 1 learner : 1 teacher', '60 minutes · Monday–Friday'], priceNote: 'San Pedro, Laguna: ₱8,000 / 20 sessions or ₱450 / session · MWF or TTh', linkText: 'Book 20+ sessions →' },
  // Group classes share a teacher's class period up to its class size (set per period in /admin).
  { id: 'playgroup', name: 'Toddler Playgroup', mode: 'branch', group: true, minSessions: 20, rate: 150, lessonMinutes: 60, slotMinutes: 60, price: '₱3,000 / 20 sessions', note: 'Ages 2–3 · Group class', icon: '🎨', tagline: 'Nurturing young hearts and minds, where curiosity meets learning', description: 'Music and movement, arts and crafts, painting, tracing, recognition, life skills, socialization and play.', details: ['Ages 2–3 · Group class, minimum 4 learners', '60 minutes · Monday–Friday'], priceNote: 'San Pedro, Laguna: Monday, Wednesday and Friday only', linkText: 'Book 20+ sessions →' },
  { id: 'nursery-1', name: 'Nursery 1', link: 'nursery', icon: '🧸', tagline: 'Building confidence and independence while having fun', description: 'Writing, Math, Language and Reading, with prayer, song and dance. Books and uniform are excluded.', details: ['Age 3 by October 31 · One-year program', '90 minutes · Monday–Friday · Minimum 5 learners'], price: '₱2,500 / month', linkText: 'Enroll for a month →' },
  { id: 'nursery-2', name: 'Nursery 2', link: 'nursery', icon: '✏️', tagline: 'Building confidence and independence while having fun', description: 'Writing, Math, Language, Reading and Science. Books and uniform are excluded.', details: ['Age 4 by October 31 · One-year program', '90 minutes · Monday–Friday · Minimum 5 learners'], price: '₱2,500 / month', linkText: 'Enroll for a month →' },
  { id: 'nursery', name: 'Nursery Class', homepage: false, mode: 'branch', group: true, minSessions: 20, maxSessions: 20, rate: 125, lessonMinutes: 90, slotMinutes: 90, price: '₱2,500 / month', note: 'Nursery 1 (age 3) · Nursery 2 (age 4) · Monthly enrollment of 20 class days', linkText: 'Enroll for a month →' },
  { id: 'summer', name: 'Summer Class', link: '', icon: '☀️', tagline: 'Learn, explore and build confidence.', description: 'Reading, writing and numeracy. Learning materials cost an additional ₱250.', details: ['Ages 4–5 · Group class, minimum 5 learners', '90 minutes · Monday–Friday'], price: '₱3,500 / 30 sessions', linkText: 'Inquire about this program →' },
  { id: 'online', name: 'Online Tutorial', mode: 'online', minSessions: 5, rate: 200, lessonMinutes: 50, slotMinutes: 60, price: 'Fees confirmed by the center', note: 'Nursery to Grade 6 · One-to-one', icon: '💻', tagline: 'Expand your horizons and embrace the joy of learning at KieAn', description: 'Assignment assistance and learning support based on parents’ requests. A one-hour slot includes 10 minutes between lessons.', details: ['Nursery to Grade 6 · One-to-one', '50-minute lesson · Minimum 5 sessions'], linkText: 'Book 5+ sessions →' },
  { id: 'kiddie-care', name: 'KieAn Kiddie Care', mode: 'branch', group: true, care: true, minSessions: 1, rate: null, lessonMinutes: 60, slotMinutes: 60, price: 'From ₱100/hour walk-in · ₱230/day · ₱4,300/month', note: 'Age 1 and above · Day stay, night stay or walk-in · Regular or special needs care', icon: '🏠', tagline: 'Your child’s next comfort home', description: 'Learn, play and care at our South Square branch. Day stay, night stay or walk-in care, for regular or special needs children, by the day or as a monthly package.', details: ['Age 1 and above · South Square'], linkText: 'Book care days →',
    // Kiddie Care rate poster. Monthly packages are 20 school days, Monday–Friday.
    careRates: {
      day: {rates: {regular: {4: 230, 6: 350, 8: 480}, special: {4: 400, 6: 550, 8: 650}}, monthly: {regular: {4: 4300, 6: 6700, 8: 9000}}, tutorial: {day: {regular: 200, special: 300}, month: {regular: 3000, special: 5000}}},
      night: {rates: {regular: {4: 300, 6: 450, 8: 550}, special: {4: 550, 6: 700, 8: 800}}, monthly: {regular: {12: 8500}}},
      'walk-in-day': {maxHours: 8, perHour: {regular: 100, special: 170}},
      'walk-in-night': {maxHours: 12, perHour: {regular: 130, special: 200}}
    },
    notes: ['Late pick-up: ₱50 for the first 30 minutes, ₱75 for 1 hour, then ₱100 per succeeding hour, charged automatically after the agreed schedule.', 'Meals and snacks are not included.', 'An authorized pick-up list is required.'] },
  { id: 'field-trip', name: 'Educational Tour / Field Trip', link: '', icon: '🚌', tagline: 'Let the adventure begin outside the classroom', description: 'Mind Museum, Tales of Illumina, Manuel L. Quezon Museum, Presidential Car Museum, KKK Museum and El Deposito. Full payment is required to reserve a seat.', details: ['October 3, 2026', 'Cavite branches: ₱2,500 / person'], price: 'Pila, Laguna: ₱2,830 / person', linkText: 'Inquire about this program →' },
];
// Geo-fence places (portfolio pp. 35–39). Which branch serves which place is branch data (see DEFAULT_BRANCHES and /admin).
// Defaults: Branch 1 (General Trias) = the Pasong Kawayan II branches; Branch 2 (General Trias) = San Francisco.
const B1 = ['natania', 'south-square', 'maliksi'], B2 = ['san-francisco'], B3 = ['naic'], B4 = ['san-pedro'], B5 = ['pila'];
const AREA_LIST = {
  'Metro Manila': {'Quezon City': B1, 'Manila': B2, 'San Juan': B2, 'Mandaluyong': B2, 'Pasig': B2, 'Marikina': B2, 'Makati': B3, 'Taguig': B3, 'Pasay': B4, 'Muntinlupa': B4, 'Pateros': B4, 'Parañaque': B4, 'Las Piñas': B4, 'Caloocan': B5, 'Valenzuela': B5, 'Malabon': B5, 'Navotas': B5},
  'Cavite': {'General Trias': B1, 'Trece Martires': B1, 'Imus': B1, 'Dasmariñas': B1, 'Bacoor': B1, 'Tagaytay': B1, 'Kawit': B1, 'Noveleta': B1, 'Rosario': B2, 'Tanza': B2, 'Naic': B2, 'Maragondon': B2, 'Magallanes': B2, 'General Emilio Aguinaldo': B2, 'Silang': B3, 'Carmona': B3, 'General Mariano Alvarez': B3, 'Alfonso': B3, 'Amadeo': B3, 'Indang': B3, 'Mendez': B3},
  'Laguna': {'San Pedro': B4, 'Biñan': B4, 'Santa Rosa': B4, 'Cabuyao': B4, 'Calamba': B4, 'San Pablo': B4, 'Alaminos': B4, 'Bay': B4, 'Calauan': B4, 'Cavinti': B4, 'Famy': B4, 'Kalayaan': B4, 'Pila': B5, 'Santa Cruz': B5, 'Pagsanjan': B5, 'Lumban': B5, 'Paete': B5, 'Pakil': B5, 'Pangil': B5, 'Magdalena': B5, 'Majayjay': B5, 'Liliw': B5, 'Nagcarlan': B5, 'Rizal': B5, 'Victoria': B5, 'Los Baños': B5, 'Luisiana': B5},
  'Batangas': {'Batangas City': B1, 'Tanauan': B1, 'Santo Tomas': B1, 'Lipa': B1, 'Rosario': B2, 'San Juan': B2, 'Padre Garcia': B2, 'Ibaan': B2, 'Lobo': B3, 'San Pascual': B3, 'Bauan': B3, 'Alitagtag': B3, 'Cuenca': B3, 'Nasugbu': B4, 'Calatagan': B4, 'Tuy': B4, 'Balayan': B4, 'Calaca': B4, 'Lemery': B4, 'Lian': B5, 'Talisay': B5, 'Laurel': B5, 'Agoncillo': B5, 'San Nicolas': B5, 'Mataas na Kahoy': B5},
  'Other Luzon': {'Bataan': B1, 'Bulacan (Angat to Hagonoy)': B1, 'Pampanga (Angeles to Arayat)': B1, 'Nueva Ecija': B2, 'Tarlac (Tarlac City to Camiling)': B2, 'Pampanga (San Fernando to Sasmuan)': B3, 'Zambales': B3, 'Quezon Province': B3, 'Bicol Region': B3, 'MIMAROPA': B4, 'Rizal Province': B5}
};
export const slug = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const AREAS = Object.entries(AREA_LIST).flatMap(([region, places]) => Object.keys(places).map(name => ({id: slug(region + ' ' + name), region, name})));
const defaultAreas = branchId => Object.entries(AREA_LIST).flatMap(([region, places]) => Object.entries(places).filter(([, ids]) => ids.includes(branchId)).map(([name]) => slug(region + ' ' + name)));
const photos = (id, n) => Array.from({length: n}, (_, i) => `assets/branch-${id}-${i + 1}.webp`);
// The branches KieAn starts with (portfolio pp. 16–18, 27–39). Live branches are edited in /admin and saved in config.json.
export const DEFAULT_BRANCHES = [
  {id: 'san-pedro', name: 'San Pedro, Laguna', address: 'Block 22 Lot 4, Unit E, 2nd Floor, Chrysanthemum Village, San Pedro, Laguna', programs: ['academic', 'after-school', 'sped', 'playgroup'], rates: {academic: 250, sped: 400}},
  {id: 'pila', name: 'Pila, Laguna', address: '9007 A, Pedro Napil, Mabini Street, Pila, Laguna', programs: ['academic', 'after-school', 'sped', 'playgroup', 'nursery']},
  {id: 'natania', name: 'Natania Homes', address: 'Phase 1A, Block 9 Lot 5, Natania Homes, Barangay Pasong Kawayan II, General Trias, Cavite', programs: ['academic', 'after-school', 'playgroup', 'nursery']},
  {id: 'south-square', name: 'South Square', address: '0052, 2nd Floor, Barangay Pasong Kawayan II, General Trias, Cavite', programs: ['academic', 'after-school', 'sped', 'kiddie-care']},
  {id: 'san-francisco', name: 'San Francisco', address: 'Phase 1, Block 27 Lot 36, Tierra Nevada, Barangay San Francisco, General Trias, Cavite', programs: ['academic', 'after-school', 'sped', 'nursery']},
  {id: 'maliksi', name: 'Maliksi Heroes-Town', address: '2F, Block 21 Lots 30–32, Unit 2, Phase 1, Pamayanang Maliksi, Barangay Pasong Kawayan II, General Trias, Cavite', programs: ['academic', 'after-school', 'sped', 'playgroup']},
  {id: 'naic', name: 'Ciudad Nuevo, Naic', address: 'Phase 2, Block 2 Lot 3, Ciudad Nuevo, Barangay Timalan Balsahan, Naic, Cavite', programs: ['academic', 'after-school', 'nursery']}
].map(b => ({...b, available: true, areas: defaultAreas(b.id), photos: photos(b.id, b.id === 'naic' ? 4 : 2)}));
// Branch helpers take the current branch list (from config.json on the server, /api/config in the browser).
export const branchById = (branches, id) => branches.find(b => b.id === id);
export const offers = (branches, branchId, programId) => branchId === 'online' ? programId === 'online' : Boolean(branchById(branches, branchId)?.available !== false && branchById(branches, branchId)?.programs.includes(programId));
export const areaBranches = (branches, areaId) => branches.filter(b => b.available !== false && b.areas.includes(areaId)).map(b => b.id);
// Online teachers follow the same geo-fence: they serve the areas of their own branches.
export const teacherServes = (teacher, areaId, branches) => Boolean(areaId) && teacher.branches.some(b => b !== 'online' && areaBranches(branches, areaId).includes(b));
// Per-session rates: package price ÷ 20 sessions (portfolio pp. 6–12); San Pedro has its own rates (p. 32).
// A null rate (Kiddie Care) means the center confirms the fee.
export const sessionRate = (programId, branch) => branch?.rates?.[programId] ?? PROGRAMS.find(p => p.id === programId)?.rate ?? null;
// Programs a parent can book right now (info programs have no mode; paused ones have available: false).
export const bookable = p => Boolean(p?.mode) && p.available !== false;
export const peso = amount => '₱' + amount.toLocaleString('en-PH');
export const totalLabel = total => total == null ? 'Confirmed by the center' : peso(total);
export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_REQUEST_FILES = 3;
// Homepage photo galleries, edited in /admin (Permits and Feedback). src opens in the viewer; thumb is the grid image.
export const DEFAULT_GALLERIES = {
  testimonials: [
    {src: 'assets/testimonials-1.webp', thumb: 'assets/testimonials-1-thumb.webp', alt: 'Parent messages describing their child’s progress from first enrollment to improvement'},
    {src: 'assets/testimonials-2.webp', thumb: 'assets/testimonials-2-thumb.webp', alt: 'Parent feedback messages for KieAn teachers'},
    {src: 'assets/testimonials-3.webp', thumb: 'assets/testimonials-3-thumb.webp', alt: 'Parent thank-you messages and Toddler Playgroup feedback'},
    {src: 'assets/testimonials-4.webp', thumb: 'assets/testimonials-4-thumb.webp', alt: 'More parent feedback and recommendations'}
  ],
  permits: [
    {src: 'assets/permit-dti.webp', thumb: 'assets/permit-dti-thumb.webp', caption: 'DTI Business Name Registration', alt: 'DTI Certificate of Business Name Registration for KieAn Tutorial Center'},
    {src: 'assets/permit-lgu-2026.webp', thumb: 'assets/permit-lgu-2026-thumb.webp', caption: '2026 Integrated LGU Permit', alt: '2026 Integrated LGU Permit, City of General Trias'},
    {src: 'assets/permit-bir-2303-1.webp', thumb: 'assets/permit-bir-2303-1-thumb.webp', caption: 'BIR Certificate of Registration (1 of 2)', alt: 'BIR Certificate of Registration, Form 2303, page 1'},
    {src: 'assets/permit-bir-2303-2.webp', thumb: 'assets/permit-bir-2303-2-thumb.webp', caption: 'BIR Certificate of Registration (2 of 2)', alt: 'BIR Certificate of Registration, Form 2303, page 2'},
    {src: 'assets/permit-receipt-notice.webp', thumb: 'assets/permit-receipt-notice-thumb.webp', caption: 'BIR Receipt / Invoice Notice', alt: 'BIR notice: this establishment must issue a receipt or invoice'}
  ]
};
// Kiddie Care stay types; hour options for day/night stays, rates and notes come from the care program (editable in /admin).
export const CARE_TYPES = {
  day: {label: 'Day stay', unit: 'day', hourOptions: [4, 6, 8]},
  night: {label: 'Night stay', unit: 'night', night: true, hourOptions: [4, 6, 8, 12]},
  'walk-in-day': {label: 'Walk-in, daytime (per hour)', unit: 'visit', walkIn: true},
  'walk-in-night': {label: 'Walk-in, night (per hour)', unit: 'visit', night: true, walkIn: true}
};
// Live program state: PROGRAMS, PERIOD_TYPES, KIDDIE_CARE and KIDDIE_NOTES follow the saved program list (setPrograms).
export let PROGRAMS, PERIOD_TYPES, KIDDIE_CARE, KIDDIE_NOTES;
const careHours = (id, r = {}) => r.maxHours ? Array.from({length: r.maxHours}, (_, i) => i + 1) : CARE_TYPES[id].hourOptions.filter(h => ['regular', 'special'].some(n => r.rates?.[n]?.[h] || r.monthly?.[n]?.[h]));
export function setPrograms(list) {
  PROGRAMS = list;
  const care = list.find(p => p.care);
  KIDDIE_CARE = Object.fromEntries(Object.entries(CARE_TYPES).filter(([id]) => care?.careRates?.[id]).map(([id, type]) => [id, {...type, ...care.careRates[id], hours: careHours(id, care.careRates[id])}]).filter(([, c]) => c.hours.length));
  KIDDIE_NOTES = care?.notes || [];
  // A working period may be limited to a kind of lesson: [start, end] or [start, end, type].
  PERIOD_TYPES = [
    {id: 'any', label: 'Any program'}, {id: 'online', label: 'Online only'}, {id: 'f2f', label: 'Face to face only'},
    ...(list.some(p => p.id === 'sped') ? [{id: 'sped', label: 'SPED face to face only'}] : []),
    ...list.filter(p => p.group && !p.care).map(p => ({id: p.id, label: /class$/i.test(p.name) ? p.name : `${p.name} class`, group: true})),
    ...(care ? [{id: 'kiddie-care', label: `${care.name} (day)`, group: true}, {id: 'kiddie-night', label: `${care.name} (night, may end after midnight)`, group: true, overnight: true}] : [])
  ];
}
setPrograms(DEFAULT_PROGRAMS);
const tutorialFee = (c, per, needs, wanted) => {
  if (!wanted) return 0;
  const fee = c.tutorial?.[per]?.[needs];
  if (!fee) throw new Error(`The tutorial add-on is not offered for this ${c.label.toLowerCase()} plan.`);
  return fee;
};
// Price a Kiddie Care booking; throws an Error with a parent-facing message for an invalid combination.
export function kiddieQuote({care, needs, hours, plan, tutorial, days}) {
  const c = KIDDIE_CARE[care], h = Number(hours), monthly = plan === 'monthly', addTutorial = tutorial === true || tutorial === 'true';
  if (!c) throw new Error('Choose a type of care.');
  if (!['regular', 'special'].includes(needs)) throw new Error('Choose regular or special needs care.');
  if (!c.hours.includes(h)) throw new Error(`${c.label} is ${c.hours.join(', ')} hours.`);
  const who = needs === 'special' ? 'Special needs' : 'Regular';
  if (monthly) {
    const price = c.monthly?.[needs]?.[h];
    if (!price) throw new Error(`There is no monthly ${c.label.toLowerCase()} package for ${h} hours (${who.toLowerCase()} care).`);
    const extra = tutorialFee(c, 'month', needs, addTutorial);
    return {total: price + extra, unit: price, summary: `${c.label} · ${h} hours · ${who} · Monthly package ${peso(price)}${extra ? ` + tutorial ${peso(extra)}/month` : ''} (20 school days, Mon–Fri)`};
  }
  const unit = c.perHour ? (c.perHour[needs] || 0) * h : c.rates?.[needs]?.[h];
  if (!unit) throw new Error(`${c.label} for ${h} hours is available as a monthly package only.`);
  const extra = tutorialFee(c, 'day', needs, addTutorial), n = Number(days) || 0;
  const rate = c.perHour ? `${peso(c.perHour[needs])}/hour × ${h} h` : `${peso(unit)}/${c.unit}`;
  return {total: (unit + extra) * n, unit: unit + extra, summary: `${c.label} · ${h} hours · ${who} · ${rate}${extra ? ` + 1-hour tutorial ${peso(extra)}` : ''} × ${n} ${c.unit}${n === 1 ? '' : 's'}`};
}
// Which period type and length a booking needs (Kiddie Care night stays use overnight periods).
export function careTiming(program, {care, hours} = {}) {
  if (!program.care) return {length: program.slotMinutes, periodType: program.id};
  const c = KIDDIE_CARE[care];
  if (!c) throw new Error('Choose a type of care.');
  if (!c.hours.includes(Number(hours))) throw new Error(`${c.label} is ${c.hours.join(', ')} hours.`);
  return {length: Number(hours) * 60, periodType: c.night ? 'kiddie-night' : 'kiddie-care'};
}
// A period's end in minutes after its start day's midnight; overnight periods end the next morning.
const periodEnd = (start, end) => minutes(end) <= minutes(start) ? minutes(end) + 1440 : minutes(end);
// Group programs book only in periods marked for them; those periods take no other lessons.
function periodAllows(type = 'any', program, periodType = program.id) {
  if (program.group) return type === periodType;
  return type === 'any' || (type === 'online' && program.mode === 'online') || (type === 'f2f' && program.mode === 'branch') || (type === 'sped' && program.id === 'sped');
}
// Seats in the class period that contains this start time (1 for one-to-one lessons).
export function seatsAt(teacher, program, day, time, periodType = program.id) {
  if (!program.group) return 1;
  const period = (teacher.weekly[weekday(day)] || []).find(([start, end, type]) => type === periodType && minutes(start) <= minutes(time) && minutes(time) < periodEnd(start, end));
  return period?.[3] || 1;
}
// Group bookings may share a slot with the same program up to its seats; anything else needs the teacher free.
export function slotFree(bookings, start, end, programId, seats) {
  const clash = bookings.filter(b => overlap(start, end, Date.parse(b.start), Date.parse(b.end)));
  return PROGRAMS.find(p => p.id === programId)?.group ? clash.every(b => b.programId === programId) && clash.length < seats : !clash.length;
}
// Teacher schedules from the 2026 portfolio (pp. 28–34), Mon–Fri unless the PDF says MWF/TTh/M&F.
// Open tutorial slots → 'f2f', "OPEN FOR SPED" → 'sped', online blocks → 'online', Playgroup/Nursery → class periods
// (slot count from the PDF, 10 where it gives none). Lunch breaks and FULL SLOT hours are left out.
// Emails are placeholders: /admin adds these paused; enter each real email, connect Google Calendar, then turn on bookings.
const MF = [1, 2, 3, 4, 5], MWF = [1, 3, 5], TTH = [2, 4];
const week = (...parts) => { const w = {}; for (const [days, ranges] of parts) for (const d of days) (w[d] ??= []).push(...ranges.map(r => [...r])); for (const d in w) w[d].sort((x, y) => x[0].localeCompare(y[0])); return w; };
const portfolio = (id, name, bio, programs, branch, weekly, available = false) => ({id, name, bio, googleEmail: `${id}@example.com`, available, programs, branches: programs.includes('online') ? ['online', branch] : [branch], weekly, blackoutDates: []});
const TUTOR = ['academic', 'after-school'];
export const PORTFOLIO_TEACHERS = [
  portfolio('natania-t1', 'Natania Teacher 1', 'Face to face · Nursery 1 and Nursery 2 classes.', ['nursery'], 'natania', week([MF, [['09:00', '10:30', 'nursery', 10], ['11:00', '12:30', 'nursery', 10]]])),
  portfolio('natania-t2', 'Natania Teacher 2', 'Face to face · Toddler Playgroup, tutorials and Nursery 2.', [...TUTOR, 'playgroup', 'nursery'], 'natania', week([MF, [['09:00', '10:00', 'playgroup', 4], ['10:00', '12:00', 'f2f'], ['14:00', '15:00', 'f2f'], ['15:00', '16:30', 'nursery', 10]]])),
  portfolio('south-square-t1', 'South Square Teacher 1', 'Face to face · all slots currently full.', TUTOR, 'south-square', week([MF, [['09:00', '12:00', 'f2f'], ['13:00', '18:00', 'f2f']]])),
  portfolio('south-square-t2', 'South Square Teacher 2', 'Face to face · tutorials and SPED.', [...TUTOR, 'sped'], 'south-square', week([MF, [['09:00', '10:00', 'f2f'], ['13:00', '14:00', 'f2f'], ['14:00', '15:00', 'sped'], ['16:00', '17:00', 'sped'], ['17:00', '18:00', 'f2f']]])),
  portfolio('south-square-t3', 'South Square Teacher 3', 'Online tutorials.', ['online'], 'south-square', week([MF, [['09:00', '12:00', 'online']]])),
  portfolio('san-francisco-t1', 'San Francisco Teacher 1', 'Online tutorials.', ['online'], 'san-francisco', week([MF, [['13:00', '18:00', 'online']]])),
  portfolio('san-francisco-t2', 'San Francisco Teacher 2', 'Face to face · tutorials and SPED.', [...TUTOR, 'sped'], 'san-francisco', week([MF, [['11:00', '12:00', 'sped'], ['13:00', '14:00', 'f2f'], ['15:00', '16:00', 'f2f'], ['17:00', '18:00', 'f2f']]])),
  portfolio('maliksi-t1', 'Maliksi Teacher 1', 'Blended · face to face mornings, online afternoons.', ['online', ...TUTOR, 'sped', 'playgroup'], 'maliksi', week([MF, [['09:00', '10:00', 'f2f'], ['10:00', '11:00', 'playgroup', 3], ['11:00', '12:00', 'sped'], ['13:00', '17:00', 'online'], ['17:00', '18:00', 'f2f']]])),
  portfolio('naic-t1', 'Ciudad Nuevo Teacher 1', 'Blended · Nursery class, tutorials and online.', ['online', ...TUTOR, 'nursery'], 'naic', week([MF, [['09:00', '10:30', 'nursery', 5], ['11:00', '12:00', 'f2f'], ['13:00', '15:00', 'online'], ['17:00', '18:00', 'f2f']]], [[1, 5], [['15:00', '16:00', 'f2f']]])),
  portfolio('san-pedro-t1', 'San Pedro Teacher 1', 'Face to face · Playgroup (MWF), tutorials and SPED.', [...TUTOR, 'sped', 'playgroup'], 'san-pedro', week([MWF, [['09:00', '10:00', 'playgroup', 3], ['10:00', '11:00', 'sped'], ['14:00', '15:00', 'sped']]], [TTH, [['09:00', '11:00', 'sped'], ['13:00', '14:00', 'f2f'], ['14:00', '15:00', 'sped']]])),
  portfolio('san-pedro-t2', 'San Pedro Teacher 2', 'Online tutorials.', ['online'], 'san-pedro', week([MF, [['09:00', '12:00', 'online'], ['13:00', '16:00', 'online']]])),
  portfolio('pila-t1', 'Pila Teacher 1', 'Face to face · Nursery class.', ['nursery'], 'pila', week([MF, [['09:00', '10:30', 'nursery', 10]]])),
  portfolio('pila-t2', 'Pila Teacher 2', 'Face to face · tutorials and SPED.', [...TUTOR, 'sped'], 'pila', week([MF, [['09:00', '10:00', 'sped']]])),
  portfolio('pila-t3', 'Pila Teacher 3', 'Face to face · SPED and Toddler Playgroup.', [...TUTOR, 'sped', 'playgroup'], 'pila', week([MF, [['09:00', '11:00', 'sped'], ['11:00', '12:00', 'playgroup', 3]]])),
  portfolio('pila-t4', 'Pila Teacher 4', 'Online mornings, face to face afternoons.', ['online', ...TUTOR], 'pila', week([MF, [['09:00', '12:00', 'online'], ['13:00', '15:00', 'f2f']]])),
  portfolio('pila-t5', 'Pila Teacher 5', 'Online mornings, SPED face to face afternoons.', ['online', ...TUTOR, 'sped'], 'pila', week([MF, [['09:00', '12:00', 'online'], ['13:00', '16:00', 'sped']]])),
  portfolio('kiddie-care-staff', 'Kiddie Care Staff', 'KieAn Kiddie Care at South Square, 7:00 AM to 7:00 PM.', ['kiddie-care'], 'south-square', week([MF, [['07:00', '19:00', 'kiddie-care', 10]]])),
];
export const PREVIEW_TEACHERS = [
  {id:'preview-teacher',name:'Sample teacher',bio:'Preview schedule only. The center will add its teachers before bookings open.',programs:DEFAULT_PROGRAMS.filter(p=>p.mode).map(p=>p.id),branches:['online', ...DEFAULT_BRANCHES.map(b=>b.id)],weekly:{1:[['09:00','17:00']],2:[['09:00','17:00']],3:[['09:00','17:00']],4:[['09:00','17:00']],5:[['09:00','17:00']]},blackoutDates:[]}
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
export function slotLabel(time,duration=60) { return `${timeLabel(time)} – ${timeLabel(clock((minutes(time)+duration)%1440))}`; }
export function dateLabel(day,short=false) { return new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',...(short?{}:{year:'numeric'})}).format(new Date(day+'T12:00:00Z')); }
export function slotsForDay(teacher,program,day,now=new Date(),leadMinutes=60,slotMinutes=program.slotMinutes,periodType=program.id) {
  if (!validDate(day) || day < manilaDay(now) || day > addDays(manilaDay(now),HORIZON_DAYS) || teacher.blackoutDates?.includes(day)) return [];
  if (program.mode === 'branch' && [0,6].includes(weekday(day))) return [];
  const slots=[];
  for(const [start,end,type] of teacher.weekly[weekday(day)] || []) {
    if(!periodAllows(type,program,periodType)) continue;
    // Starts stay on this day (before midnight); overnight periods let the stay end the next morning.
    for(let n=Math.ceil(minutes(start)/60)*60;n+slotMinutes<=periodEnd(start,end)&&n<1440;n+=60) {
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
const DAY_SHORT=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],TYPE_SHORT={online:'Online',f2f:'F2F',sped:'SPED',playgroup:'Playgroup',nursery:'Nursery','kiddie-care':'Kiddie Care','kiddie-night':'Kiddie Care night'};
const shortTime=time=>timeLabel(time).replace(':00','');
// Group days that share the same hours, e.g. "Mon–Fri · 9 AM–12 PM Online".
export function scheduleSummary(weekly={}){
  const order=[1,2,3,4,5,6,0],groups=[];
  for(const day of order){
    const ranges=weekly[day]||[];if(!ranges.length)continue;
    const key=JSON.stringify(ranges),last=groups.at(-1);
    if(last&&last.key===key&&order.indexOf(last.days.at(-1))===order.indexOf(day)-1)last.days.push(day);else groups.push({key,days:[day],ranges});
  }
  const merged=[];for(const g of groups){const same=merged.find(m=>m.key===g.key);if(same)same.days.push(...g.days);else merged.push({...g,days:[...g.days]});}
  const dayLabel=days=>{const idx=days.map(d=>order.indexOf(d));const run=idx.every((v,i)=>i===0||v===idx[i-1]+1);return run&&days.length>2?`${DAY_SHORT[days[0]]}–${DAY_SHORT[days.at(-1)]}`:days.map(d=>DAY_SHORT[d]).join(', ');};
  const hours=Object.values(weekly).flat().reduce((sum,[start,end])=>sum+(periodEnd(start,end)-minutes(start))/60,0);
  return {lines:merged.map(g=>`${dayLabel(g.days)} · ${g.ranges.map(([s,e,t,seats])=>`${shortTime(s)}–${shortTime(e)}${t&&t!=='any'?' '+TYPE_SHORT[t]:''}${seats?` (${seats} seats)`:''}`).join(', ')}`),hours};
}
// Match an OpenStreetMap reverse-geocoding address to a geo-fence area (town first, then province/region).
const plainName = text => slug(String(text || '').replace(/^city of /i, '').replace(/ city$/i, ''));
export function matchArea(address = {}) {
  const provinces = [address.province, address.state, address.region].map(plainName).filter(Boolean);
  const towns = [address.city, address.town, address.municipality, address.village, address.city_district, address.county].map(plainName).filter(Boolean);
  const inRegion = area => provinces.some(p => p.includes(slug(area.region)) || (area.region === 'Metro Manila' && /metro-manila|national-capital|ncr/.test(p)));
  for (const town of towns) {
    const hits = AREAS.filter(a => a.region !== 'Other Luzon' && plainName(a.name) === town);
    const hit = hits.find(inRegion) ?? (provinces.length ? null : hits[0]);
    if (hit) return hit;
  }
  // Whole provinces and regions only; partial ones like "Bulacan (Angat to Hagonoy)" need a manual choice.
  return AREAS.find(a => a.region === 'Other Luzon' && !a.name.includes('(') && provinces.some(p => [plainName(a.name), plainName(a.name.replace(/ (Province|Region)$/, ''))].includes(p))) ?? null;
}
