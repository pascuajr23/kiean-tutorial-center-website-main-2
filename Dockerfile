FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs shared.mjs ./
COPY lib ./lib
COPY scripts ./scripts
COPY index.html booking.html style.css booking.css site.js booking.js ./
COPY admin.html admin.css admin-responsive.css admin.js ./
COPY assets ./assets
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
