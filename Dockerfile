# KieAn website: Node 24 standard library only (no npm install), so a single small stage is enough.
FROM node:24-alpine
WORKDIR /app
# Shown on the public About page: the commit and its date (set by the GitHub Actions build).
ARG KIEAN_COMMIT=""
ARG KIEAN_UPDATED=""
ENV KIEAN_COMMIT=$KIEAN_COMMIT \
    KIEAN_UPDATED=$KIEAN_UPDATED
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    KIEAN_CONFIG=/etc/kiean/config.json \
    KIEAN_DATA_DIR=/var/lib/kiean
# Least-changing files first so code edits reuse the cached image layers.
COPY package.json server.mjs ./
COPY lib ./lib
COPY scripts ./scripts
COPY public ./public
# App files stay root-owned (the app cannot modify itself). Only config (atomic saves from /admin)
# and data (bookings database, uploaded photos) are writable by the unprivileged "node" user.
RUN mkdir -p /etc/kiean /var/lib/kiean && chown node:node /etc/kiean /var/lib/kiean
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--no-warnings=ExperimentalWarning", "server.mjs"]
