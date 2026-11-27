# Security policy

This project runs a live booking system that handles parents' contact details, children's names and payment receipts, so security reports are welcome and taken seriously.

## Reporting a vulnerability

Please **do not open a public GitHub issue** for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (private vulnerability reporting). Include:

- what an attacker could do, and what they need first (signed in as admin or not, a valid booking, and so on);
- the steps or a minimal request that shows it, using test data;
- the version or commit you looked at.

You can expect a first reply within a few days. Please give us reasonable time to fix the issue before you disclose it publicly.

## Please do not

- test against the live site, kieantutorial.com, in ways that create real bookings, emails or calendar events, or that affect availability for real families;
- access, keep or share other people's data.

Run your own copy instead: `npm start` without a `config.json` starts a preview with sample data, and [DEPLOY.md](DEPLOY.md) explains a full live setup with your own Google project.

## Supported versions

Only the latest release on the `main` branch receives security fixes.
