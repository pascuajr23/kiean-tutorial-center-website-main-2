# KieAn Tutorial Center — Website and Teacher Booking

This package updates the supplied website and adds teacher booking for at least five sessions. Choose several dates, then one time that is available on every date. The Monday–Friday shortcut can fill a week in one click, and dates can be added across months.

The package opens in **preview mode**. Preview uses a clearly marked sample teacher and does not store bookings or update Google Calendar. Actual teacher names, schedules and Google credentials were not supplied. Live deployment has not been performed.

## Start the preview

Install Node.js **24 or newer**. No npm packages are required.

On Windows, extract the ZIP and run `START-PREVIEW.cmd`. Alternatively, open a terminal inside the website folder and run:

```sh
npm start
```

Open **http://127.0.0.1:3000**. The booking page is **http://127.0.0.1:3000/booking.html**.

Example: choose Online Tutorial → Sample teacher → Add Mon–Fri → 10:00 AM–11:00 AM → Continue to details. You can preview the confirmation and download an `.ics` calendar file. The downloaded preview is explicitly labeled as a preview.

Do not open `booking.html` by double-clicking it: its JavaScript modules need an HTTP server. Static hosting can display the website and the booking preview, but **live booking requires the included Node server**. Uploading these files to GitHub Pages alone cannot update Google Calendar.

## Booking behavior

- Every submitted booking must contain **5–40 unique dates**, within the next 180 days.
- One teacher, one program, one branch or online format, and one start time apply to the entire booking.
- Time labels, teacher working hours and date boundaries use **Asia/Manila (UTC+8)** regardless of the visitor’s device timezone.
- The portfolio specifies **50-minute online lessons**. This implementation reserves **60 minutes** in the teacher’s calendar: 50 minutes of instruction and 10 minutes between lessons, matching the requested example of 10–11 AM. This buffer is an implementation choice, not an additional fact from the PDF.
- Face-to-face Academic, After School and SPED/SNED sessions last 60 minutes. Face-to-face booking is limited to Monday–Friday, as stated in the portfolio.
- A date cannot be submitted outside the teacher’s published working hours, on a blackout date, in the past, or less than the configured lead time ahead. The default lead time is 60 minutes.
- Available time options are the intersection of availability across **every** chosen date. The server checks all dates again at submission.
- The teacher’s calendar receives **one private, busy event for each selected date**. Events include the parent’s contact details and the learning request, for the assigned teacher’s use.
- The site confirms only when every calendar event is successfully created. Retrying the same request does not create duplicate events.
- Parents receive an on-screen reference and a downloadable calendar file. Automatic parent email invitations and Google Meet creation are **not configured**. The center supplies lesson access details and fees.

Academic and After School programs remain described as 2 learners to 1 teacher, following the PDF. This initial scheduler reserves the whole teacher slot for one booking; staff may arrange the paired learner. It does not automatically combine unrelated parent bookings or manage group capacity. Nursery, Toddler, Summer, Kiddie Care and the field trip have inquiry links because their cohort schedules and capacity were not provided.

## Connect Google Calendar

Each teacher authorizes their own Google account. KieAn reads free/busy periods and creates private events on that account’s primary calendar. The server verifies that the signed-in Google email exactly matches the teacher’s configured `googleEmail`; OAuth tokens stay server-side and refresh tokens are encrypted in SQLite.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select the KieAn project and enable **Google Calendar API**.
2. Configure the OAuth consent screen and create an OAuth client ID with application type **Web application**. Add the production URL `https://kieantutorial.com/api/google/callback` as an authorized redirect URI (replace the domain with the deployed site). Calendar access scopes may require Google OAuth app verification before general availability; do not leave the app in Testing for production because test-user refresh tokens can expire after seven days.
3. Copy `config.example.json` to a private `config.json`. Add each teacher’s exact Google account email as `googleEmail`, then set their programs, branches, working hours and blackout dates. Set `mode` to `live` and `publicOrigin` to the exact HTTPS site origin.
4. Set the following server environment variables. Generate the encryption key once and keep it stable; changing it makes existing teacher connections unreadable.

```sh
export NODE_ENV=production
export KIEAN_CONFIG=/etc/kiean/config.json
export GOOGLE_OAUTH_CLIENT_ID=your-web-client-id
export GOOGLE_OAUTH_CLIENT_SECRET=your-web-client-secret
export KIEAN_TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)"
export KIEAN_DATA_DIR=/var/lib/kiean
```

For the supplied systemd unit, put the OAuth client ID, client secret and one generated encryption key in `/etc/kiean/kiean.env` as `GOOGLE_OAUTH_CLIENT_ID=...`, `GOOGLE_OAUTH_CLIENT_SECRET=...` and `KIEAN_TOKEN_ENCRYPTION_KEY=...` (without `export`). Set restrictive file permissions, for example `chmod 600 /etc/kiean/kiean.env`. Generate the encryption value once with `openssl rand -base64 32` and preserve it in your secret backup.

5. Deploy behind HTTPS. Give each teacher their individual connection link: `https://kieantutorial.com/api/teachers/TEACHER_ID/google/connect`, replacing `TEACHER_ID` with their configured id. The teacher signs into the matching Google account and approves calendar access. The callback confirms the connection; unconnected teachers cannot be booked.
6. Run `npm run check-calendar`. This checks each teacher calendar without creating events.
7. Complete a controlled five-session test booking. Confirm that all five events appear on the correct teacher calendar, in Philippine Time, and that the same slots are no longer offered. Remove that test booking with the cancellation command below after validation.

The integration does not add attendees, so it does not send automatic parent invitations. Each teacher can revoke KieAn access from their Google Account security settings; they will need to reconnect before bookings can resume.

If replacing an already-live service-account setup, this change does not migrate old events or pending requests. Back up the database, resolve pending requests, and move or recreate existing schedule events on each teacher’s primary calendar before switching traffic; otherwise the new availability check will not see events left on the old shared calendars.

Official Google references: [web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server), [FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [event creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

## Teacher configuration

Each teacher needs a unique `id` and unique `googleEmail`. A single teacher should appear once, even if they teach several programs or branches. Their connected primary calendar prevents overlaps across those programs and branches.

| Setting | Meaning |
| --- | --- |
| `googleEmail` | Exact Google account email the teacher will authorize |
| `programs` | Any of `online`, `academic`, `after-school`, `sped` |
| `branches` | `online`, `san-pedro`, `pila`, `natania`, `south-square`, `san-francisco`, `maliksi`, `naic` |
| `weekly` | Day keys: `0` Sunday, `1` Monday, through `6` Saturday |
| Working periods | Arrays such as `[["09:00","12:00"],["13:00","17:00"]]`, all in Philippine Time |
| `blackoutDates` | Closed dates such as `["2026-12-25", "2027-01-01"]` |
| `leadMinutes` | Minimum advance notice, at least 60 minutes |

Working periods generate start times every 30 minutes and require the full hour to fit before closing. Lunch breaks, holidays and approved operating hours must be supplied by the center. The PDF does not establish 9 AM–5 PM or 10 PM as current operating hours; those unsupported claims were removed from the public site. Hours in the sample configuration are examples only.

Restart the server after changing the configuration. Existing confirmed bookings are not moved automatically if a teacher’s working hours or calendar assignment changes. Keep existing teacher IDs and calendar assignments stable where possible.

## Hosting

The existing `CNAME` contains `kieantutorial.com` and is preserved. No DNS changes have been made.

Use the included `deploy/kiean.service.example` and `deploy/Caddyfile.example` as deployment templates on the agreed VPS. Install Node 24, create a `kiean` service user, place application files in `/opt/kiean`, private configuration in `/etc/kiean`, and create `/var/lib/kiean` owned by that service user. Verify the Node executable path in the systemd template. The proxy needs the actual domain’s DNS pointing to the VPS before it can obtain an HTTPS certificate.

The backend serves only explicitly allowed public files and approved image assets. Keep configuration, OAuth secrets, the token encryption key and database outside any independently configured static web root. Back up the encryption key separately and securely with the database; losing it prevents existing teacher connections from being decrypted. Proxy the whole website to the Node server; do not serve the complete source directory publicly.

GitHub Actions runs the tests and builds the Docker image on pushes and pull requests. Pushes publish to `ghcr.io/OWNER/REPOSITORY` with a `sha-...` tag and a branch tag; the default branch also updates `latest`. GHCR packages are private by default, so grant the deployment host package-read access or change the package visibility before pulling anonymously.

`TRUST_PROXY=1` is appropriate only when the Node server is reachable exclusively through the trusted proxy. It enables per-client rate limits using the final forwarded address. Keep the Node listener on `127.0.0.1` for the provided VPS setup. A Dockerfile is also supplied for container deployments; mount private config and persistent data at runtime.

Keep one persistent SQLite database shared by the application processes on the same host. Do not run independent copies against different databases for the same teacher calendars. Site requests reserve all slots in one SQLite transaction, including overlapping 30-minute start times, before touching Google Calendar. Back up the database securely using SQLite-aware backups or while the service is stopped. Calendar and booking records contain personal information; apply the center’s retention process.

## Failed updates and cancellations

Google Calendar does not provide a transaction across separate event creations. The application checks all dates, holds them locally, and compensates for a failed batch by removing the generated event IDs. A timeout, uncertain insert result or incomplete cleanup keeps the request in `review` and its slots held. A process interruption leaves a durable pending record, so those slots are not silently reopened.

List unresolved requests without changing anything:

```sh
npm run reconcile
```

To release an unresolved request, stop the booking service first, allow in-flight requests to finish, and ensure the request is at least five minutes old. With the same configuration and data-directory environment variables used by the server:

```sh
node scripts/reconcile.mjs --cancel KTC-REFERENCE --server-stopped
```

The command deletes that booking’s calendar events and releases its reservations only if cleanup succeeds. This also supports staff-authorized cancellation of a confirmed booking. Restart the server afterward. To clean up all unresolved requests after reviewing them:

```sh
node scripts/reconcile.mjs --cancel-pending --server-stopped
```

Do not delete an event only in Google Calendar when cancelling a website booking: the local reservation will remain until the cancellation command updates it. To reschedule, cancel the original booking and make a new complete booking. Staff should contact the parent separately; this tool does not send messages.

External calendar edits made at exactly the same moment as a website submission cannot be locked by Google’s API. Teachers should block unavailable periods before opening them for booking. The transaction prevents competing website bookings, while the live FreeBusy check catches existing Google Calendar conflicts.

## Content source and updates

The source of truth is the supplied **2026 portfolio**. The agreement informs the booking scope; it is not published on the website. Private agreement pages, investment contracts and testimonial screenshots are not copied into public assets.

| Portfolio pages | Implemented content |
| --- | --- |
| 2–4 | August 2020 founding, leadership credentials and roles, mission, vision and core values |
| 6–12 | Academic, After School, SPED/SNED, Toddler, Nursery 1 and 2, Summer: audience, durations, rates and exclusions |
| 13 | October 3, 2026 field trip, destinations and Cavite/Pila rates |
| 14 | Online: Nursery–Grade 6, one-to-one, 50 minutes and at least five sessions; Kiddie Care age range; four partnership options |
| 16–18 | Seven current branch locations, including Maliksi Heroes-Town and Ciudad Nuevo, Naic |
| 26 | Correct tagline and program taglines; removed “We care to grow” |

Online tuition is not quoted in the portfolio, so the website asks the center to confirm it. Package rates are not prorated into invented five-session prices. Unsupported fixed investment returns were removed. The existing Facebook contact link is retained and should be verified by KieAn before public launch. The current Kiddie Care poster, actual teacher roster, approved operating hours, holiday closures and lesson access process are still needed from the center.

## Verification

Run `npm test` for booking and integration tests using a simulated Calendar service. They cover the five-session rule, Philippine Time, same-slot dates, calendar conflicts, overlapping concurrent bookings, duplicate retries, calendar outages, rollback, durable holds, calendar export and protected server files. No live Google Calendar changes are made by the tests. Live Google credentials were unavailable during development; complete the live validation in the connection steps above before opening public bookings.

The delivered version passed 17 automated tests, desktop and mobile browser checks, and a complete browser-to-server booking flow with a simulated Calendar service. The browser checks covered the four-session restriction, five- and ten-session selection, parent details, confirmation, calendar download, blocked overlapping times and responsive layout. Preview screenshots are included in `docs/booking-desktop.png` and `docs/booking-mobile.png`.
