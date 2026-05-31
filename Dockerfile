FROM ghcr.io/anomalyco/opencode:latest

ARG OPENCODE_USER=opencode

ENV HOME=/home/${OPENCODE_USER}

ENV PATH="$PATH:${HOME}/.bun/bin:/app/bin"

RUN apk update && apk upgrade
RUN apk add --no-cache bash curl libc6-compat git nodejs npm g++ make python3

RUN adduser -D "$OPENCODE_USER" && addgroup "$OPENCODE_USER" "$OPENCODE_USER"
USER ${OPENCODE_USER}

WORKDIR /app

COPY --chown=${OPENCODE_USER}:${OPENCODE_USER} docker-tools/install-bun.sh /app/install-bun.sh

RUN bash /app/install-bun.sh

WORKDIR /app/forkhammer

COPY --chown=${OPENCODE_USER}:${OPENCODE_USER} package.json bun.lock ./

RUN bun install --frozen-lockfile

COPY --chown=${OPENCODE_USER}:${OPENCODE_USER} src ./src

RUN mkdir -p "$HOME/.local/state"

COPY --chown=${OPENCODE_USER}:${OPENCODE_USER} docker-tools/start.sh /app/start.sh

WORKDIR /app

ENTRYPOINT ["bash", "/app/start.sh"]
