# Notice: what the MIT License covers

The **source code** in this repository (JavaScript, HTML structure, CSS, tests, scripts, Docker and deployment files) is released under the [MIT License](LICENSE).

The MIT License does **not** cover KieAn Tutorial Center's brand and business content. These remain © KieAn Tutorial Center (Kierlle Bachiller Piad, sole proprietor), all rights reserved:

- the KieAn name, logo and tagline ("We care to learn."): `public/assets/kiean-logo.*`, `public/assets/kiean-icon.png`, `public/assets/og-image.png`, `public/assets/fbmes.webp` and the logo inside `lib/mailer.mjs` emails;
- every photo and scan in `public/assets/` (branches, leadership, testimonials, permits and registrations) and the screenshots in `docs/screenshots/`;
- the center's business details, program descriptions, prices, policies and page copy (for example in `public/index.html`, `public/faq.html`, `privacy-policy.html`, `terms.html`, `refund-policy.html`, `cookie-policy.html`, `consent-form.html`, `contact.html`, `payment.html`, `public/shared.mjs` defaults and `lib/mailer.mjs`).

If you fork this project for your own school or tutoring business, replace the logo, photos, business details and policy text with your own before you publish it. Do not present your site as KieAn Tutorial Center.

## Third-party fonts

The self-hosted fonts in `public/assets/fonts/` are licensed under the SIL Open Font License 1.1, which travels with them:

| Font | Files | License |
| --- | --- | --- |
| DM Sans | `dm-sans-latin.woff2`, `dm-sans-latin-ext.woff2` | [OFL-DMSans.txt](public/assets/fonts/OFL-DMSans.txt) |
| Nunito | `nunito-latin.woff2`, `nunito-latin-ext.woff2` | [OFL-Nunito.txt](public/assets/fonts/OFL-Nunito.txt) |

## Place names

[`public/ph-areas.mjs`](public/ph-areas.mjs) lists every Philippine province, city and municipality, derived from the Philippine Statistics Authority's Philippine Standard Geographic Code (PSGC), via the open-data API at [psgc.gitlab.io](https://psgc.gitlab.io).

The project has no other third-party code: the server and browser code use only Node.js and web platform built-ins.
