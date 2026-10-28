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

- Online bookings must contain **5–40 unique dates**; face-to-face bookings (Academic, After School, SPED/SNED) must contain **20–40**. All dates fall within the next 180 days.
- One teacher, one program, one branch or online format, and one start time apply to the entire booking.
- Time labels, teacher working hours and date boundaries use **Asia/Manila (UTC+8)** regardless of the visitor’s device timezone.
- The portfolio specifies **50-minute online lessons**. This implementation reserves **60 minutes** in the teacher’s calendar: 50 minutes of instruction and 10 minutes between lessons, matching the requested example of 10–11 AM. This buffer is an implementation choice, not an additional fact from the PDF.
- Face-to-face Academic, After School and SPED/SNED sessions last 60 minutes. Face-to-face booking is limited to Monday–Friday, as stated in the portfolio.
- A date cannot be submitted outside the teacher’s published working hours, on a blackout date, in the past, or less than the configured lead time ahead. The default lead time is 60 minutes.
- Available time options are the intersection of availability across **every** chosen date. The server checks all dates again at submission.
- The teacher’s calendar receives **one private, busy event for each selected date**. Events include the parent’s contact details and the learning request, for the assigned teacher’s use.
- The site confirms only when every calendar event is successfully created. Retrying the same request does not create duplicate events.
- Step 3 shows the total price (sessions × per-session rate: Online ₱200; Academic/After School ₱150; SPED ₱300; San Pedro Academic ₱250 and SPED ₱400). Parents can attach up to 3 homework files and one payment receipt (JPG, PNG, WebP or PDF, 5 MB each). Files are checked by type and signature and saved in `KIEAN_DATA_DIR/uploads/<booking id>/`. Payment instructions come from `paymentInstructions` in `config.json`.
- Online bookings create **one** invitation on the center Google Calendar (`centerEmail`) covering every session date, with one Google Meet link. The parent and the teacher are guests, so both can join Meet without being admitted. The teacher also keeps a private busy event per session with the Meet link. Every parent also gets one branded email with the full schedule (online: with the Meet link).
- Email subjects start with the first session day, for example `Mon, Nov 2, 2026 · New schedule starts · …`. Emails use the website's colours and logo, with a plain-text fallback.
- The assigned teacher gets an email for every new booking with the schedule, total, uploaded files, and **PAID** (receipt uploaded) or **UNPAID**. Emails are sent from the center Gmail (`centerEmail` in `config.json`). If an email fails, the booking still stands and the error is logged.

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
export KIEAN_ADMIN_USER=center-admin
export KIEAN_ADMIN_PASSWORD='replace-with-a-long-unique-password'
export KIEAN_DATA_DIR=/var/lib/kiean
```

For the supplied systemd unit, put the OAuth client ID, client secret, one generated encryption key, and admin username/password in `/etc/kiean/kiean.env` (without `export`). Set restrictive file permissions, for example `chmod 600 /etc/kiean/kiean.env`. Generate the encryption value once with `openssl rand -base64 32` and preserve it in your secret backup. Keep the admin password private and use the admin page only through HTTPS.

5. Deploy behind HTTPS. Give each teacher their individual connection link: `https://kieantutorial.com/api/teachers/TEACHER_ID/google/connect`, replacing `TEACHER_ID` with their configured id. The teacher signs into the matching Google account and approves calendar access. The callback confirms the connection; unconnected teachers cannot be booked.
6. Open `https://kieantutorial.com/admin` and sign in with `KIEAN_ADMIN_USER` and `KIEAN_ADMIN_PASSWORD`. Add teachers, toggle booking availability, select their programs and branches, and set weekly hours in Philippine Time. New teachers start with no hours and are disabled until configured. Save changes to update public booking options immediately. Existing teacher IDs cannot be removed, and a connected teacher’s Google email cannot be changed here.
7. Run `npm run check-calendar`. This checks each teacher calendar without creating events.
8. Complete a controlled five-session test booking. Confirm that all five events appear on the correct teacher calendar, in Philippine Time, and that the same slots are no longer offered. Remove that test booking with the cancellation command below after validation.

To test the Google sign-in locally before deploying, set `publicOrigin` to `http://localhost:3000`, add `http://localhost:3000/api/google/callback` as an authorized redirect URI, leave `NODE_ENV` unset, and browse via `http://localhost:3000` (not `127.0.0.1`). Use Chrome or Firefox; Safari rejects the `Secure` state cookie over plain HTTP. Production still requires HTTPS.

**Center Google account (emails and online invitations):** enable the **Gmail API** in the Cloud project, add the scope `https://www.googleapis.com/auth/gmail.send` under Google Auth Platform → Data Access, set `centerEmail` in `config.json`, restart, then open `/admin` and click **Connect center Google account (emails & invites)** while signed in to that Google account. Each teacher can revoke KieAn access from their Google Account security settings; they will need to reconnect before bookings can resume.

If replacing an already-live service-account setup, this change does not migrate old events or pending requests. Back up the database, resolve pending requests, and move or recreate existing schedule events on each teacher’s primary calendar before switching traffic; otherwise the new availability check will not see events left on the old shared calendars.

Official Google references: [web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server), [FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [event creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

## Teacher configuration

Each teacher needs a unique `id` and unique `googleEmail`. A single teacher should appear once, even if they teach several programs or branches. Their connected primary calendar prevents overlaps across those programs and branches.

| Setting | Meaning |
| --- | --- |
| `googleEmail` | Exact Google account email the teacher will authorize |
| `available` | `true` to include the teacher in booking choices; `false` to pause new bookings |
| `programs` | Any of `online`, `academic`, `after-school`, `sped` |
| `branches` | `online`, `san-pedro`, `pila`, `natania`, `south-square`, `san-francisco`, `maliksi`, `naic` |
| `weekly` | Day keys: `0` Sunday, `1` Monday, through `6` Saturday |
| Working periods | Arrays such as `[["09:00","12:00"],["13:00","17:00"]]`, all in Philippine Time |
| Period type | Optional third value: `online` (Online Tutorial only), `f2f` (Academic, After School, SPED), `sped` (SPED face to face only). Omitted means any program. Example: `["09:00","12:00","online"]` |
| `blackoutDates` | Closed dates such as `["2026-12-25", "2027-01-01"]` |
| `leadMinutes` | Minimum advance notice, at least 60 minutes |

To copy a portfolio teacher schedule (pp. 28–34) into `/admin`, add one period per block for each weekday it applies to (use separate weekday rows for MWF and TTh patterns):

- Online blocks such as 9:00–9:50, 10:00–10:50: one **Online only** period 09:00–12:00 (each 50-minute lesson uses a one-hour slot).
- Face-to-face tutorial slots: **Face to face only**.
- Slots marked "OPEN FOR SPED": **SPED face to face only**.
- Lunch breaks, Nursery and Playgroup group classes: leave them out, so they are never offered.
- "FULL SLOT" hours: leave them out, or let the teacher's Google Calendar events block them.

Working periods generate start times on the whole hour only (for example 10:00, 11:00) and require the full hour to fit before closing. A period starting at 09:30 offers its first slot at 10:00. Lunch breaks, holidays and approved operating hours must be supplied by the center. The PDF does not establish 9 AM–5 PM or 10 PM as current operating hours; those unsupported claims were removed from the public site. Hours in the sample configuration are examples only.

Teacher roster changes saved from `/admin` apply immediately. Restart the server after manual configuration edits. Existing confirmed bookings are not moved automatically if a teacher’s working hours or calendar assignment changes. Keep existing teacher IDs and calendar assignments stable where possible.

## Hosting

The existing `CNAME` contains `kieantutorial.com` and is preserved. No DNS changes have been made.

Use the included `deploy/kiean.service.example` and `deploy/Caddyfile.example` as deployment templates on the agreed VPS. Install Node 24, create a `kiean` service user, place application files in `/opt/kiean`, and create `/etc/kiean` owned by that user so the admin page can atomically save roster changes. Keep OAuth/admin secrets in root-owned `/etc/kiean-secrets/kiean.env`, readable by the `kiean` group, and create `/var/lib/kiean` owned by the service user. The systemd sandbox allows writes only to the roster config and persistent data directories. Verify the Node executable path in the systemd template. The proxy needs the actual domain’s DNS pointing to the VPS before it can obtain an HTTPS certificate.

The backend serves only explicitly allowed public files and approved image assets. Keep configuration, OAuth secrets, the token encryption key and database outside any independently configured static web root. Back up the encryption key separately and securely with the database; losing it prevents existing teacher connections from being decrypted. Proxy the whole website to the Node server; do not serve the complete source directory publicly.

GitHub Actions runs the tests and builds the Docker image on pushes and pull requests. Pushes publish to `ghcr.io/OWNER/REPOSITORY` with a `sha-...` tag and a branch tag; the default branch also updates `latest`. GHCR packages are private by default, so grant the deployment host package-read access or change the package visibility before pulling anonymously.

### Deploy to the VPS with Docker (kieantutorial.com)

GitHub Actions builds and publishes an image on every push: `ghcr.io/pascuajr23/kiean-tutorial-center-website-main-2:main` for `main`, a tag named after any other branch (for example `:development`), and an immutable `sha-…` tag per commit. The image runs as an unprivileged user, holds no secrets, and has a health check. `deploy/compose.yaml` runs the `:main` image on `127.0.0.1:3001` only. The host's Caddy (not a container) serves HTTPS and proxies to it; see `deploy/Caddyfile.example`.

**1. DNS and Caddy.** Point `kieantutorial.com`, `www.kieantutorial.com` and `proxy.kieantutorial.com` to the VPS. Open only ports 80 and 443. In `/etc/caddy/Caddyfile`, proxy the main site to `127.0.0.1:3001` and add `request_body { max_size 25MB }` so booking attachments fit (see `deploy/Caddyfile.example`), then `sudo systemctl reload caddy`.

**2. Create the folder and `compose.yaml`.** Run these on the VPS:

```sh
sudo mkdir -p /opt/kiean/config /opt/kiean/data
sudo chown -R "$USER" /opt/kiean
cd /opt/kiean
nano compose.yaml
```

Paste this into `compose.yaml` (the same file as `deploy/compose.yaml` in this repository):

```yaml
# KieAn main site. The host's Caddy serves kieantutorial.com and proxies to 127.0.0.1:3001.
# The port is bound to localhost only, so the app is reachable solely through Caddy.
services:
  kiean:
    image: ghcr.io/pascuajr23/kiean-tutorial-center-website-main-2:main
    restart: unless-stopped
    env_file:
      - ./kiean.env
    environment:
      TRUST_PROXY: "1"
    ports:
      - "127.0.0.1:3001:3000"
    volumes:
      - ./config:/etc/kiean
      - ./data:/var/lib/kiean
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
```

**3. Add the secrets in `kiean.env`.** The app reads all secrets from this one file. Docker Compose loads it through `env_file`, and it is never in git or in the image. Create it with a fresh encryption key and admin password already generated:

```sh
cd /opt/kiean
umask 077
cat > kiean.env <<EOF
GOOGLE_OAUTH_CLIENT_ID=PASTE_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET=PASTE_CLIENT_SECRET
KIEAN_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
KIEAN_ADMIN_USER=kieanadmin@gmail.com
KIEAN_ADMIN_PASSWORD=$(openssl rand -base64 24)
EOF
nano kiean.env
```

In `nano`, replace `PASTE_CLIENT_ID` and `PASTE_CLIENT_SECRET`. Write values without quotes or spaces around `=`.

| Secret | Where it comes from |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud Console → Google Auth Platform → Clients → your **production** Web client → Client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Same client → **Add secret** (use a new one; the old one was shared in chat) |
| `KIEAN_TOKEN_ENCRYPTION_KEY` | Generated above. Keep it forever and back it up offline: changing or losing it disconnects every teacher and the center account. |
| `KIEAN_ADMIN_USER` / `KIEAN_ADMIN_PASSWORD` | Your `/admin` login. Show the generated password with `grep KIEAN_ADMIN_PASSWORD kiean.env` and store it in a password manager. |

In the Google client, the **Authorized redirect URI** must be exactly `https://kieantutorial.com/api/google/callback`.

`NODE_ENV`, `PORT`, `KIEAN_CONFIG` and `KIEAN_DATA_DIR` are already set inside the image. Do not add them.

**4. Add the site settings in `config/config.json`.** Copy your working local file from your computer:

```sh
# on your computer, in the project folder
scp config.json YOUR_VPS_USER@YOUR_VPS:/opt/kiean/config/config.json
```

Then on the VPS, open `nano /opt/kiean/config/config.json` and check these values:

```json
"mode": "live",
"publicOrigin": "https://kieantutorial.com",
"centerEmail": "kieanadmin@gmail.com",
"paymentInstructions": "GCash: 09XX XXX XXXX (Account Name) ...",
```

Each teacher's `googleEmail` must be the Google account they will connect. Remove local test teachers you do not want on the live site.

**5. Lock down permissions.** The container runs as uid 1000. It must own `config/` (the `/admin` page saves the roster there) and `data/` (database and uploaded receipts):

```sh
cd /opt/kiean
chmod 600 kiean.env config/config.json
sudo chown -R 1000:1000 config data
sudo chmod 700 config data
```

**6. Pull and start.** The GHCR package is private by default. Log in once with a GitHub personal access token (classic) that has only the `read:packages` scope. Paste the token as the password:

```sh
cd /opt/kiean
docker login ghcr.io -u pascuajr23
docker compose pull
docker compose up -d
docker compose ps                 # STATUS should become "healthy"
docker compose logs -f kiean      # last line should end with (LIVE)
curl -sI http://127.0.0.1:3001    # should answer HTTP/1.1 200
```

If the container stops, `docker compose logs kiean` names the missing or invalid setting. For example, `Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.` means `kiean.env` is incomplete. To confirm a value reached the container without printing the secret: `docker compose exec kiean sh -c 'test -n "$GOOGLE_OAUTH_CLIENT_SECRET" && echo set'`. Do not share the output of `docker compose config`; it prints every secret.

After editing `kiean.env` or `config/config.json` (use `sudo nano` for the config, since uid 1000 owns it), apply the change with `docker compose up -d --force-recreate`.

**7. Connect Google on the live site.** Connections made on localhost stay on your computer and are not copied to the VPS. On https://kieantutorial.com:
- each teacher opens `https://kieantutorial.com/api/teachers/TEACHER_ID/google/connect`;
- in `/admin`, click **Connect center Google account (emails & invites)** and sign in as `kieanadmin@gmail.com`.

**Update to a new version:** `docker compose pull && docker compose up -d`. To pin or roll back, replace `main` in `compose.yaml` with a `sha-…` tag.

**Development site (proxy.kieantutorial.com, port 3000).** Use a separate folder (e.g. `/opt/kiean-dev`) with its own `compose.yaml` (image tag set to your branch name, port `"127.0.0.1:3000:3000"`), its own `config/`, `data/` and `kiean.env`, and `"publicOrigin": "https://proxy.kieantutorial.com"`. Add `https://proxy.kieantutorial.com/api/google/callback` to the dev OAuth client. Never share `data/` between main and development: both would book the same teacher calendars.

**Cancel or reconcile a booking** (the server must be stopped):

```sh
docker compose stop kiean
docker compose run --rm kiean node scripts/reconcile.mjs --cancel KTC-REFERENCE --server-stopped
docker compose start kiean
```

**Back up** `config/`, `data/` (SQLite database and uploaded receipts) and `kiean.env` together, encrypted and off the VPS, e.g. nightly: `docker compose stop kiean && sudo tar czf kiean-$(date +%F).tgz config data kiean.env && docker compose start kiean`. Without the encryption key, the stored Google connections cannot be read.

### Using the Google API securely

- **Rotate the client secret before going live.** The current secret was shared in a chat. In Google Cloud Console → Clients → your Web client, add a new secret, put it in the VPS `kiean.env`, restart, then delete the old one.
- **Separate dev and production.** Create a second OAuth client for local testing (redirect `http://localhost:3000/api/google/callback`). The production client should list only `https://kieantutorial.com/api/google/callback` as its redirect URI and no JavaScript origins.
- **Branding.** Add `kieantutorial.com` as an authorized domain and set the home page and privacy policy URLs.
- **Publish the app.** While the consent screen is in *Testing*, Google expires refresh tokens after 7 days, so calendars and emails stop working weekly. Switch the audience to *In production* and complete Google's verification for the sensitive scopes (`calendar.events`, `calendar.freebusy`, `gmail.send`).
- **Least privilege.** The app requests only those scopes plus `openid`/`email`. It needs no API key. Enable only the Google Calendar API and Gmail API in the project.
- **Secrets stay on the VPS.** Only in `kiean.env` (mode 600) and `config/`. They are excluded from the image and from git. Refresh tokens are stored AES-256-GCM-encrypted in SQLite with `KIEAN_TOKEN_ENCRYPTION_KEY`.
- **Admin.** Use a long random `KIEAN_ADMIN_PASSWORD` and open `/admin` only over HTTPS.
- **Revoking.** Any teacher or the center can revoke access at https://myaccount.google.com/permissions; they then reconnect from the links above.

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
