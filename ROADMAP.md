# KieAn Tutorial Center Website Roadmap

*As of Nov 27, 2026.*

kieantutorial.com already takes real bookings for 7 branches and online tutoring; five phases are done, go-live setup is now, then operations and growth, and four later phases take it from one center to many.

## At a glance

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Launch the booking website | Done, Oct 2026 |
| 2 | Run the center from the admin panel | Done, Oct–Nov 2026 |
| 3 | Trust: security, privacy and compliance | Done, Nov 2026 |
| 4 | Payments and the parent experience | Done, Nov 2026 |
| 5 | Reach, accessibility and safety | Done, Nov 2026 |
| 6 | Go-live: the owner's setup | Now |
| 7 | Day-to-day operations | Next (proposed) |
| 8 | Growth | Later (ideas to validate) |
| 9 | Scale: a platform that stays up as bookings grow | Future |
| 10 | Multi-branch operations | Future |
| 11 | Learning hub for families | Future |
| 12 | Open platform for other centers | Future |

## Phase 1 · Launch the booking website (done, Oct 2026)

Parents can book a teacher, dates and one shared time slot online, and every session lands on the teacher's Google Calendar.

- **Public website:** homepage with programs, 7 branches in Cavite and Laguna, leadership, parent feedback and permits.
- **Booking page:** parents choose their area, online or face to face, a program, branch and teacher, then pick dates and one time for all of them (5+ online, 20+ face-to-face sessions).
- **Live availability:** open slots come from each teacher's Google Calendar, and two parents can never book the same slot.
- **Online lessons:** one Google Meet invitation to parent and teacher, with the same link for every session.
- **Emails from the center's Gmail:** the teacher gets the booking with any uploaded files; the parent gets the full schedule.
- **Hosting:** Docker on the server, behind Caddy and Cloudflare, at kieantutorial.com.

## Phase 2 · Run the center from the admin panel (done, Oct–Nov 2026)

Staff now change teachers, programs, locations and homepage photos in /admin, with no code edits or redeploys.

- **Teachers:** weekly schedules, programs, branches and Google Calendar connection; the 17 portfolio teachers can be imported in one click.
- **Programs:** details, prices and the Kiddie Care rate table; the homepage program cards update from the same data.
- **Locations:** address, photos, programs offered and the cities each branch serves.
- **Homepage photos:** Permits and Feedback galleries are edited in admin.
- **Safe deletes:** an item must be disabled first, then confirmed in 3 steps; the server enforces this.
- **Defaults:** new programs and locations are assigned to teacher-1 automatically.

## Phase 3 · Trust: security, privacy and compliance (done, Nov 2026)

The site is hardened, follows Philippine data and e-commerce law, and scores 99 for mobile performance on PageSpeed.

- **Security:** strict security headers and CSP, an admin lockout after 10 wrong passwords, Cloudflare-aware rate limits and encrypted Google tokens.
- **Legal pages:** privacy, terms, refund, cookie, consent form, FAQ and contact, with the DTI business disclosure and a separate privacy consent at booking (Data Privacy Act, Internet Transactions Act).
- **Privacy in photos:** children's names and faces and the TIN are redacted in testimonials and permits.
- **Partner section:** reworded so it makes no public investment or profit-sharing offer.
- **SEO:** sitemap, robots.txt, canonical links, meta tags and a custom 404 page.
- **Security audit:** a quick pass with Cloudflare's security-audit skill found no confirmed vulnerability; its 5 leads were fixed in v0.1.10.

## Phase 4 · Payments and the parent experience (done, Nov 2026)

Parents can pay by GCash during booking using the QR code of the branch they chose, and the flow works on slow phone connections.

- **GCash payment:** a How to Pay page, receipt upload at booking, and the QR code shown in the booking payment box.
- **Payment QR per location (v0.1.11):** staff upload QR codes in admin and assign one or more to each location; one QR can serve several branches.
- **Default QR and emails (v0.1.12):** the How to Pay page shows a default QR, and unpaid booking emails show the booked location's QR codes.
- **Booking fixes:** changes from a parent walkthrough, and a clash message that lists the dates already taken.
- **Slow internet:** loading skeletons, plus one-photo sliders for permits and feedback on phones.
- **Teacher calendar:** each face-to-face session appears as one entry on the teacher's Google Calendar.

## Phase 5 · Reach, accessibility and safety (done, Nov 2026)

Families anywhere in the Philippines or abroad now find the right branch or online teacher, and the site is easier to read and safer to run.

- **Open source (v0.1.12):** MIT license, deploy guide and security policy on GitHub; KieAn's brand and photos stay reserved.
- **Geo-fencing (v0.1.13):** every Philippine province and city, with separate face-to-face and online areas per location, and locations reordered in admin.
- **About page (v0.1.14):** the public version and last update date, plus a visible Admin login button in the footer.
- **Families abroad (v0.1.15):** "Outside the Philippines" for online lessons, times shown in the parent's own time zone, child-safety rules (RA 7610, RA 11930) and international privacy and refund rights.
- **Accessibility (v0.1.16):** readable orange text and no tiny labels on the homepage, every booking step and admin.
- **Automatic backups (v0.1.17):** bookings, settings and photos saved every midnight Philippine time and kept 14 days; an admin Backups screen shows the latest backup, backs up now and downloads it.

## Phase 6 · Go-live: the owner's setup (now)

The features are built; the center's own setup steps (real QR codes, teacher accounts, credentials and server settings) make the live site match the real center. The checklist is kept privately by the owner.

## Phase 7 · Next: day-to-day operations (proposed, not built)

The next phase moves daily booking work out of scripts and inboxes into the admin panel.

- **Bookings screen in admin:** list and search bookings, mark them paid after checking the receipt, and cancel or reschedule (replacing the reconcile script).
- **Reminder email:** sent to the parent the day before a session.
- **Cleanup:** expire unpaid holds and delete old uploads and records on a set schedule that matches the privacy policy.
- **Staying signed in:** admin sessions that survive a server restart.

## Phase 8 · Later: growth (ideas to validate)

These ideas grow the site into a fuller school system; each should be checked with parents and staff before it is built.

- **Parent accounts:** see bookings, rebook, and upload a receipt later.
- **Online payment:** a payment gateway that marks bookings paid automatically.
- **Learner records:** attendance and progress reports.
- **Staff roles:** separate access for the owner and branch staff.
- **Enrollment:** group class enrollment, waitlists and monthly renewals.
- **Dashboard:** bookings per branch over time.

## Phase 9 · Scale: a platform that stays up as bookings grow (future)

When most families book online, the site needs copies off the server, early warnings, and room to run on more than one machine.

**Start when:** the site carries most of the center's bookings, or one outage would cost real sessions.

- **Off-site backups:** a nightly encrypted copy in cloud storage (for example Cloudflare R2), so losing the server loses nothing.
- **Monitoring and alerts:** uptime checks, and a message to staff when bookings fail or a teacher's Google connection drops.
- **Staging site:** a test copy where every change is checked before it goes live.
- **Background jobs:** emails and calendar updates sent from a queue with retries, so a slow Google reply never holds up a booking.
- **Bigger database:** move from SQLite to PostgreSQL once one server is not enough, so the site can run on several.
- **Faster images:** photos served from Cloudflare's network in the right size for each screen.

## Phase 10 · Multi-branch operations (future)

As branches are added, each branch runs its own day while the owner sees the whole center in one place.

**Start when:** new branches open beyond the current 7, or branch staff need their own access (builds on Staff roles in Phase 8).

- **Branch admins:** each branch manages its own teachers, schedule and bookings; the owner sees every branch.
- **Branch pricing and promos:** prices and discounts set per branch, not only center-wide.
- **Reports:** bookings, payments and teacher hours per branch and month, exportable to a spreadsheet.
- **Teacher hours and pay:** summaries built from completed sessions.
- **New-branch setup:** a guided checklist in admin to open a branch: address, areas served, QR codes and teachers.

## Phase 11 · Learning hub for families (future)

The site becomes where parents follow their child's learning, not only where they book it.

**Start when:** parent accounts (Phase 8) are in regular use.

- **Parent app:** an installable phone app (a web app, no app store) with bookings, reminders and receipts.
- **Progress and homework:** teachers post session notes and homework; parents see progress across a term.
- **Messages:** parent–teacher messages inside the site, kept with the booking instead of in Messenger.
- **SMS reminders:** for parents who rarely check email.
- **Filipino option:** the parent pages in Filipino as well as English.

## Phase 12 · Open platform for other centers (future)

The code is already open source, so other tutoring centers could run their own copy, and KieAn could offer it as a hosted service.

**Start when:** KieAn's own operations are steady and another center asks to use it.

- **Setup wizard:** a center enters its name, branches, programs and payment details without editing code.
- **Hosted option:** one service runs many centers, each with its own data, admin and address.
- **Guides and support:** documentation for centers that host it themselves.
- **KieAn's brand stays its own:** every copy replaces the name, logo, photos and policy text, as [NOTICE.md](NOTICE.md) already requires.

## Release history

Two pre-releases and seventeen versions shipped between Oct 8 and Nov 27, 2026.

| Date | Version | What shipped |
| --- | --- | --- |
| Nov 27, 2026 | v0.1.17 | Automatic midnight backups; admin Backups screen |
| Nov 27, 2026 | v0.1.16 | Readable orange text and labels on the homepage, booking and admin |
| Nov 27, 2026 | v0.1.15 | Families abroad; child-safety and international terms; stress tests |
| Nov 27, 2026 | v0.1.14 | About this website page; visible Admin login button |
| Nov 27, 2026 | v0.1.13 | All-Philippines geo-fencing; face-to-face and online areas; location order |
| Nov 27, 2026 | v0.1.12 | Default QR on the How to Pay page; location QR codes in unpaid emails |
| Nov 27, 2026 | v0.1.11 | Payment QR codes per location; homepage polish |
| Nov 12, 2026 | v0.1.10 | Security audit fixes; page speed improvements |
| Nov 12, 2026 | v0.1.9.1 | One calendar entry per face-to-face session |
| Nov 12, 2026 | v0.1.8 | Face-to-face teacher invite (reverted in v0.1.9.1) |
| Nov 12, 2026 | v0.1.7 | GCash QR in the booking payment box |
| Nov 12, 2026 | v0.1.6 | Privacy redactions; partner wording; teacher-1 defaults |
| Nov 12, 2026 | v0.1.5 | Philippine legal compliance |
| Nov 12, 2026 | v0.1.4 | Fixes from a parent booking walkthrough |
| Nov 12, 2026 | v0.1.3 | Security hardening; faster loading |
| Nov 12, 2026 | v0.1.2 | GCash How to Pay page; phone photo sliders |
| Nov 5, 2026 | v0.1.1 | Admin-managed programs and galleries; safe deletes; SEO; policy pages |
| Oct 28, 2026 | Pre-release | Portfolio content, payments, Google Meet, emails, Docker deploy |
| Oct 8, 2026 | Pre-release | First booking system |
