FROM ghcr.io/anomalyco/opencode:latest

ARG OPENCODE_USER=opencode

ENV HOME=/home/${OPENCODE_USER}

ENV PATH="$PATH:${HOME}/.bun/bin:/app/bin"

RUN apk update && apk upgrade
RUN apk add --no-cache bash curl libc6-compat git nodejs npm

RUN adduser -D "$OPENCODE_USER" && addgroup "$OPENCODE_USER" "$OPENCODE_USER"
USER ${OPENCODE_USER}

WORKDIR /app

COPY docker-tools/install-bun.sh /app/install-bun.sh

RUN bash /app/install-bun.sh

WORKDIR /app/build-forkhammer

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src ./src
RUN bun run build:cli

RUN mkdir -p /app/bin && mkdir -p "$HOME/.local/state"

RUN cp ./dist/forkhammer /app/bin/forkhammer

COPY docker-tools/start.sh /app/start.sh

RUN chmod +x /app/bin/forkhammer

WORKDIR /app

ENTRYPOINT ["bash", "/app/start.sh"]
