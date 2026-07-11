# syntax=docker/dockerfile:1.7

ARG ALPINE_VERSION
FROM alpine:${ALPINE_VERSION}

ARG TARGETARCH
ARG FORKHAMMER_USER=fh-user

ENV HOME=/home/${FORKHAMMER_USER}
ENV PATH="$PATH:${HOME}/.bun/bin:/app/bin"

# install runtime dependencies
RUN apk update && apk upgrade \
 && apk add --no-cache bash curl libc6-compat git nodejs npm g++ make python3 libgcc libstdc++ ripgrep

RUN adduser -D "$FORKHAMMER_USER" && addgroup "$FORKHAMMER_USER" "$FORKHAMMER_USER"
USER ${FORKHAMMER_USER}

WORKDIR /app

COPY --chown=${FORKHAMMER_USER}:${FORKHAMMER_USER} docker-tools/install-bun.sh /app/install-bun.sh
RUN bash /app/install-bun.sh

WORKDIR /app/forkhammer
COPY --chown=${FORKHAMMER_USER}:${FORKHAMMER_USER} package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY --chown=${FORKHAMMER_USER}:${FORKHAMMER_USER} src ./src
RUN mkdir -p "$HOME/.local/state"

COPY --chown=${FORKHAMMER_USER}:${FORKHAMMER_USER} docker-tools/start.sh /app/start.sh
WORKDIR /app

ENTRYPOINT ["bash", "/app/start.sh"]
