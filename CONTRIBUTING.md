# Contributing

Thanks for your interest. Bug fixes, accessibility improvements and features that would help other small schools and tutoring centers are all welcome.

## Before you start

- For anything larger than a small fix, open an issue first to agree on the approach.
- Security problems go through the private process in [SECURITY.md](SECURITY.md), not a public issue.
- KieAn's logo, photos and business text are not open source (see [NOTICE.md](NOTICE.md)). Changes to them come from the center itself.

## Development

You need Node.js 24 or newer. There are no npm dependencies to install.

```sh
npm start        # preview mode with sample data at http://127.0.0.1:3000
npm test         # the full test suite (node:test, no network, no Google account needed)
```

Preview mode needs no Google project and never writes to a calendar. To work on live-mode features, follow the local testing notes in [DEPLOY.md](DEPLOY.md#test-google-sign-in-on-your-own-computer).

## Guidelines

- **No new dependencies.** The project deliberately uses only Node.js and browser built-ins. Discuss it in an issue first if you think one is unavoidable.
- **Keep the security posture.** Validate everything at the server, keep the strict Content Security Policy (no inline scripts or styles), and never log secrets or personal data.
- **Add a test** for new behavior or a fixed bug in `tests/booking.test.mjs`, and make sure `npm test` passes.
- **Match the existing style:** small, readable functions, comments only where the reason is not obvious, plain language in user-facing text.
- Never commit `config.json`, `kiean.env`, anything in `data/`, or real personal data. They are ignored by git for a reason.

## Pull requests

Describe what changed and why, how you tested it, and include screenshots for visible changes at phone and desktop widths.
