# persona-drive in a container. A Node image plus Chromium and the libraries it needs;
# no GPU or display is required (Chromium renders in software, video included). The same
# image serves the bundled sample app and, under the compose `watch` profile, a headed
# browser on a virtual display you can watch over noVNC.
FROM node:24-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PERSONA_DRIVE_OUT=/runs

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  # Chromium, its system libraries, and the virtual display for the watch profile.
  && npx playwright install --with-deps chromium \
  && apt-get install -y --no-install-recommends xvfb x11vnc novnc websockify openbox \
  && rm -rf /var/lib/apt/lists/* /root/.npm
COPY bin ./bin
COPY src ./src
COPY personas ./personas
COPY targets ./targets
COPY sample-app ./sample-app
COPY docker ./docker

VOLUME /runs
ENTRYPOINT ["node", "bin/persona-drive.js"]
CMD ["--help"]
