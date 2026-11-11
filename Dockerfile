# KieAn website: Node 24 standard library only (no npm install), so a single small stage is enough.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    KIEAN_CONFIG=/etc/kiean/config.json \
    KIEAN_DATA_DIR=/var/lib/kiean
# Least-changing files first so code edits reuse the cached image layers.
COPY assets ./assets
COPY package.json server.mjs shared.mjs ./
COPY lib ./lib
COPY scripts ./scripts
COPY index.html booking.html admin.html admin-login.html 404.html \
     faq.html payment.html contact.html privacy-policy.html terms.html refund-policy.html cookie-policy.html consent-form.html \
     robots.txt sitemap.xml \
     style.css booking.css admin.css admin-responsive.css \
     site.js booking.js admin.js legal.js ./
# App files stay root-owned (the app cannot modify itself). Only config (atomic saves from /admin)
# and data (bookings database, uploaded photos) are writable by the unprivileged "node" user.
RUN mkdir -p /etc/kiean /var/lib/kiean && chown node:node /etc/kiean /var/lib/kiean
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--no-warnings=ExperimentalWarning", "server.mjs"]
