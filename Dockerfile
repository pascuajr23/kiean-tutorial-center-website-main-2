FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    KIEAN_CONFIG=/etc/kiean/config.json \
    KIEAN_DATA_DIR=/var/lib/kiean
COPY package.json server.mjs shared.mjs ./
COPY lib ./lib
COPY scripts ./scripts
COPY index.html booking.html style.css booking.css site.js booking.js ./
COPY admin.html admin.css admin-responsive.css admin.js ./
COPY assets ./assets
# Run as the unprivileged "node" user (uid 1000). The config directory must be
# writable because /admin saves the roster with an atomic rename beside config.json.
RUN mkdir -p /etc/kiean /var/lib/kiean && chown node:node /etc/kiean /var/lib/kiean
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/config').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--no-warnings=ExperimentalWarning", "server.mjs"]
