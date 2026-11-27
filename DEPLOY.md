# Deploy from scratch

This guide takes you from an empty server to a live booking site with Google Calendar, Google Meet and Gmail working, about an hour of work. It is written for a Linux VPS with Docker, Caddy for HTTPS and, optionally, Cloudflare in front. A plain systemd setup without Docker is at the end.

Throughout, replace:

| Placeholder | Example | Meaning |
| --- | --- | --- |
| `example.com` | `kieantutorial.com` | Your site's domain |
| `OWNER/REPO` | `pascuajr23/kiean-tutorial-center-website-main-2` | Your GitHub repository (your fork) |
| `you@example.com` | | The Google account that sends booking emails and online invitations |

> **Forking for your own school?** Replace KieAn's logo, photos, business details and policy pages before you go public. They are not covered by the MIT License; see [NOTICE.md](NOTICE.md).

## Contents

1. [What you need](#1-what-you-need)
2. [Set up Google Cloud](#2-set-up-google-cloud)
3. [Prepare the server](#3-prepare-the-server)
4. [Get the Docker image](#4-get-the-docker-image)
5. [Create the app folder](#5-create-the-app-folder)
6. [Add the secrets](#6-add-the-secrets-kieanenv)
7. [Add the site settings](#7-add-the-site-settings-configjson)
8. [Start and check](#8-start-and-check)
9. [Connect the Google accounts](#9-connect-the-google-accounts)
10. [Set up the center in /admin](#10-set-up-the-center-in-admin)
11. [Make a test booking](#11-make-a-test-booking)
12. [Put Cloudflare in front (optional)](#12-put-cloudflare-in-front-optional)
13. [Day-to-day operations](#13-day-to-day-operations)
14. [Without Docker: systemd](#14-without-docker-systemd)
15. [Troubleshooting](#15-troubleshooting)

## 1. What you need

- A Linux VPS (1 vCPU and 1 GB RAM is plenty) with a public IP address.
- A domain name whose DNS you control.
- Docker Engine with the Compose plugin, and [Caddy](https://caddyserver.com/docs/install) installed on the host.
- A Google account for the center (it sends emails and owns the online-lesson invitations), and one Google account per teacher.
- A GitHub account if you want GitHub Actions to build the image for you (recommended).

## 2. Set up Google Cloud

The site uses Google sign-in (OAuth) so each teacher's calendar can be read and written, and so the center account can send Gmail and create Meet invitations. No API key is used.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. **APIs & Services → Library:** enable **Google Calendar API** and **Gmail API**. Nothing else is needed.
3. **Google Auth Platform → Branding:** set the app name, support email, your home page (`https://example.com`) and privacy policy (`https://example.com/privacy-policy`), and add `example.com` as an authorized domain.
4. **Google Auth Platform → Data Access:** add these scopes:
   - `.../auth/calendar.events` and `.../auth/calendar.freebusy` (teachers)
   - `.../auth/gmail.send` (center account)
   - `openid` and `.../auth/userinfo.email`
5. **Google Auth Platform → Clients → Create client → Web application.** Under **Authorized redirect URIs** add exactly `https://example.com/api/google/callback`. Add no JavaScript origins. Copy the **Client ID** and **Client secret**.
6. **Google Auth Platform → Audience:** switch the app to **In production** and complete Google's verification for the sensitive scopes.

> **Do not leave the app in Testing.** In Testing mode Google expires refresh tokens after 7 days, so calendars and emails stop working every week until each account reconnects.

Use a **second client** for local testing (redirect URI `http://localhost:3000/api/google/callback`) so the production client lists only your real domain.

## 3. Prepare the server

1. **DNS:** point `example.com` and `www.example.com` (A/AAAA records) at the VPS.
2. **Firewall:** allow only ports 22, 80 and 443.
3. **Caddy:** put this in `/etc/caddy/Caddyfile` (also in [`deploy/Caddyfile.example`](deploy/Caddyfile.example)), then `sudo systemctl reload caddy`. Caddy obtains and renews the HTTPS certificate on its own.

```caddy
example.com, www.example.com {
	encode zstd gzip
	# Bookings may carry up to ~20 MB of attachments.
	request_body {
		max_size 25MB
	}
	reverse_proxy 127.0.0.1:3001
}
```

## 4. Get the Docker image

**Option A: GitHub Actions builds it (recommended).** The workflow in `.github/workflows/docker.yml` runs the tests and publishes `ghcr.io/OWNER/REPO` on every push: `:main` for the main branch, a tag per branch, and an immutable `:sha-…` tag per commit. GHCR packages start private. Either make the package public (GitHub → your profile → Packages → the package → Package settings), or log the server in once with a classic personal access token that has only the `read:packages` scope:

```sh
docker login ghcr.io -u YOUR_GITHUB_USERNAME
```

**Option B: build it on the server.**

```sh
git clone https://github.com/OWNER/REPO.git /opt/kiean-src
cd /opt/kiean-src && docker build -t kiean:local .
```

Then use `image: kiean:local` in the next step.

The image runs as an unprivileged user, contains no secrets, needs no `npm install` (the app has zero dependencies) and has a built-in health check.

## 5. Create the app folder

```sh
sudo mkdir -p /opt/kiean/config /opt/kiean/data
sudo chown -R "$USER" /opt/kiean
cd /opt/kiean
nano compose.yaml
```

Paste this (the same as [`deploy/compose.yaml`](deploy/compose.yaml)), with your image name:

```yaml
services:
  kiean:
    image: ghcr.io/OWNER/REPO:main
    restart: unless-stopped
    init: true
    env_file:
      - ./kiean.env
    environment:
      # Behind Cloudflare. Without Cloudflare, use "1" (trust the last X-Forwarded-For hop from Caddy).
      TRUST_PROXY: "cloudflare"
    ports:
      - "127.0.0.1:3001:3000"   # localhost only: the app is reachable solely through Caddy
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

`TRUST_PROXY` decides which address rate limits and the admin lockout use. `cloudflare` trusts Cloudflare's visitor header only when the request really came from a Cloudflare IP. `1` trusts the address Caddy forwards. Left unset, every visitor looks like Caddy, so use one of the two.

## 6. Add the secrets (`kiean.env`)

All secrets live in this one file. It is never in git and never in the image.

```sh
cd /opt/kiean
umask 077
cat > kiean.env <<EOF
GOOGLE_OAUTH_CLIENT_ID=PASTE_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET=PASTE_CLIENT_SECRET
KIEAN_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
KIEAN_ADMIN_USER=choose-a-private-username
KIEAN_ADMIN_PASSWORD=$(openssl rand -base64 24)
EOF
nano kiean.env   # paste the Client ID and secret; no quotes, no spaces around =
```

| Variable | What it is |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | From step 2.5 |
| `KIEAN_TOKEN_ENCRYPTION_KEY` | Encrypts stored Google refresh tokens (AES-256-GCM). **Back it up offline and never change it:** losing or changing it disconnects every teacher and the center account. |
| `KIEAN_ADMIN_USER` / `KIEAN_ADMIN_PASSWORD` | The `/admin` sign-in. Use a username that is not your public email. Read the password with `grep KIEAN_ADMIN_PASSWORD kiean.env` and keep it in a password manager. |

`NODE_ENV`, `PORT`, `KIEAN_CONFIG` and `KIEAN_DATA_DIR` are already set inside the image.

## 7. Add the site settings (`config.json`)

Start from [`config.example.json`](config.example.json) and save it as `/opt/kiean/config/config.json`. The file must be one complete JSON object.

| Key | Meaning |
| --- | --- |
| `mode` | `"live"` to take real bookings. Anything else is preview (sample data, nothing saved). Production refuses preview. |
| `publicOrigin` | Exactly `https://example.com` (HTTPS required in production) |
| `leadMinutes` | Minimum notice before a session, at least `60` |
| `centerEmail` | The center Google account (`you@example.com`) that sends emails and online invitations |
| `paymentInstructions` | Optional text shown above the payment step. Leave it empty to use the built-in GCash instructions. |
| `teachers` | At least one teacher (below). Everything else is managed later in `/admin`. |

Programs, locations, homepage photos and payment QR codes are **not** needed here: a config without them starts with the built-in defaults, and `/admin` saves them back into this file.

Each teacher:

| Field | Meaning |
| --- | --- |
| `id` | Unique, lowercase letters, digits and dashes (`teacher-1`) |
| `name`, `bio` | Shown to parents |
| `googleEmail` | The exact Google account the teacher will connect |
| `available` | `true` to accept bookings, `false` to pause |
| `programs` | Program ids, for example `["online", "academic"]` |
| `branches` | `"online"` and/or location ids, for example `["online", "natania"]` |
| `weekly` | Day keys `"0"` (Sunday) to `"6"` (Saturday), each a list of periods in Philippine Time, for example `[["09:00","12:00"],["13:00","17:00","f2f"]]`. An optional third value limits a period to one kind of session (`online`, `f2f`, `sped`, or a class program id with a fourth value for class size). |
| `blackoutDates` | Closed dates, `["2026-12-25"]` |

Teachers, hours and everything else can be edited later in `/admin`, so a minimal teacher is fine to start.

Lock down permissions. The container runs as uid 1000 and must own `config/` (admin saves) and `data/` (database and uploads):

```sh
cd /opt/kiean
chmod 600 kiean.env config/config.json
sudo chown -R 1000:1000 config data
sudo chmod 700 config data
python3 -m json.tool config/config.json > /dev/null && echo "valid JSON"
```

## 8. Start and check

```sh
cd /opt/kiean
docker compose pull          # skip for a locally built image
docker compose up -d
docker compose ps            # STATUS becomes "healthy"
docker compose logs -f kiean # the startup line ends with (LIVE)
curl -sI http://127.0.0.1:3001 | head -1   # HTTP/1.1 200 OK
```

Then open `https://example.com`. If the container stops, `docker compose logs kiean` names the missing or invalid setting.

## 9. Connect the Google accounts

Connections are made on the live site. Ones made on your computer stay on your computer.

1. **Center account:** open `https://example.com/admin`, sign in, and click **Connect** under *Admin Google account* while signed in to Google as `centerEmail`. This lets the site send booking emails and online-lesson invitations with Google Meet links.
2. **Each teacher:** send them `https://example.com/api/teachers/TEACHER_ID/google/connect` (the **Connect** link on their card in `/admin` → Teachers). They sign in with their `googleEmail` and approve calendar access. Unconnected teachers cannot be booked.

## 10. Set up the center in /admin

Open `https://example.com/admin`:

| Screen | What to set |
| --- | --- |
| **Teachers** | Names, programs, branches, weekly hours, blackout dates. Turn on *Accepting bookings* when ready. |
| **Programs** | Homepage cards, prices, session rules, Kiddie Care rate table, homepage order |
| **Locations** | Branch name, address, photos, programs offered, the cities each branch serves, and its payment QR codes |
| **Payment QR** | Upload each GCash QR (image, account name, number). Mark which ones online parents see, and one default for the How to Pay page. Assign them to locations in Locations. |
| **Permits / Feedback** | Homepage photo galleries |

Items are never deleted in one click: turn one off, save, and only then can it be deleted, with three confirmations.

## 11. Make a test booking

1. Book a few sessions with a test teacher and your own email.
2. Check that the sessions appear on the teacher's Google Calendar in Philippine Time, that the same slots are no longer offered, and that the emails arrive.
3. Cancel it (the server must be stopped while you do):

```sh
docker compose stop kiean
docker compose run --rm kiean node scripts/reconcile.mjs --cancel KTC-REFERENCE --server-stopped
docker compose start kiean
```

`docker compose run --rm kiean node scripts/check-calendar.mjs` checks every teacher's calendar connection without creating events.

## 12. Put Cloudflare in front (optional)

- **SSL/TLS → Full (strict).** Caddy already has a valid certificate.
- Restrict the server firewall so ports 80 and 443 accept only [Cloudflare's IP ranges](https://www.cloudflare.com/ips/), and keep `TRUST_PROXY: "cloudflare"`.
- **Speed → Rocket Loader: off.** It rewrites scripts, and the site's Content Security Policy blocks that.
- **Cache:** versioned CSS and JS (`?v=…`) are cached for a year and fonts are immutable. Images are cached for 7 days, so after replacing a photo under the same name, purge the cache.
- Optional: Bot Fight Mode and a rate-limiting rule on `/api/bookings`.
- Cloudflare Web Analytics injects a script the Content Security Policy blocks; turn it off, or allow `static.cloudflareinsights.com` in `script-src` and `cloudflareinsights.com` in `connect-src` in `server.mjs`.

## 13. Day-to-day operations

**Update:** `docker compose pull && docker compose up -d`. To pin or roll back, replace `:main` with a `:sha-…` tag.

**After editing `kiean.env` or `config.json` by hand:** `docker compose up -d --force-recreate` (use `sudo nano` for the config, which uid 1000 owns). Changes saved in `/admin` apply immediately.

**Back up** `config/`, `data/` (SQLite database, uploaded photos, QR codes and receipts) and `kiean.env` together, encrypted and off the server:

```sh
docker compose stop kiean && sudo tar czf kiean-$(date +%F).tgz config data kiean.env && docker compose start kiean
```

Without the encryption key in `kiean.env`, stored Google connections cannot be read.

**Unresolved bookings.** Google Calendar has no multi-event transaction, so the server holds every date locally first and removes created events if a batch fails. A timeout or uncertain result keeps the request in `review` with its slots held, never silently reopened. List them with `node scripts/reconcile.mjs`, and release one with `--cancel KTC-REFERENCE --server-stopped` (or all with `--cancel-pending --server-stopped`). Never cancel by deleting events only in Google Calendar: the site would keep the slot reserved.

**Rotate the Google client secret** by adding a new secret to the client, updating `kiean.env`, recreating the container, then deleting the old secret.

**A development copy** (for example `dev.example.com` on port 3000) needs its own folder, `compose.yaml` (your branch's image tag, `"127.0.0.1:3000:3000"`), `config/`, `data/`, `kiean.env`, `publicOrigin`, and its own redirect URI on the OAuth client. Never share `data/` between copies: both would book the same calendars.

### Test Google sign-in on your own computer

Set `"mode": "live"` and `"publicOrigin": "http://localhost:3000"` in a local `config.json`, put the secrets in a local `kiean.env`, add `http://localhost:3000/api/google/callback` to your test OAuth client, leave `NODE_ENV` unset, run `npm start` and browse to `http://localhost:3000` (not `127.0.0.1`) in Chrome or Firefox. Safari rejects the secure state cookie over plain HTTP.

## 14. Without Docker: systemd

1. Install Node.js 24, create a `kiean` system user, and copy the app to `/opt/kiean` (no `npm install` needed).
2. Create `/etc/kiean` (owned by `kiean`, holds `config.json`), `/var/lib/kiean` (owned by `kiean`, data) and `/etc/kiean-secrets/kiean.env` (root-owned, group `kiean`, mode 640, the step 6 variables).
3. Install [`deploy/kiean.service.example`](deploy/kiean.service.example) as `/etc/systemd/system/kiean.service`, check the `node` path, then `sudo systemctl enable --now kiean`. It binds to `127.0.0.1:3000`, so point Caddy's `reverse_proxy` there, and it uses `TRUST_PROXY=1`.

The unit runs with `ProtectSystem=strict`, `NoNewPrivileges` and write access only to the config and data folders.

## 15. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Container exits with `Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.` | `kiean.env` is incomplete or not next to `compose.yaml`. |
| `Live mode requires an HTTPS publicOrigin` | Set `publicOrigin` to `https://…` in `config.json`. |
| `… is not valid JSON` | The config must be one complete object from `{` to `}`; check it with `python3 -m json.tool`. |
| Google says `redirect_uri_mismatch` | The client's redirect URI must be exactly `https://example.com/api/google/callback`. |
| Teachers disconnect every 7 days | The OAuth app is still in Testing; publish it (step 2.6). |
| Admin cannot save (`EACCES`) | `config/` must be owned by uid 1000 (step 7). |
| Booking says Google Calendar is unavailable | Check the teacher's connection in `/admin`, then `scripts/check-calendar.mjs`. |
| Images still show an old version | Purge the Cloudflare cache; images are cached for 7 days. |

To confirm a secret reached the container without printing it: `docker compose exec kiean sh -c 'test -n "$GOOGLE_OAUTH_CLIENT_SECRET" && echo set'`. Do not share `docker compose config` output; it prints every secret.
