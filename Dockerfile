# syntax=docker/dockerfile:1.7

# ---- Stage 1: build a patched opencode binary from source ----
ARG ALPINE_VERSION=3.20
ARG BUN_VERSION=1.3.14
ARG OPENCODE_REF=dev

FROM alpine:${ALPINE_VERSION} AS opencode-builder

ARG BUN_VERSION
ARG OPENCODE_REF

RUN apk add --no-cache \
    bash \
    ca-certificates \
    curl \
    git \
    g++ \
    make \
    python3

ENV BUN_INSTALL=/opt/bun
ENV PATH=/opt/bun/bin:$PATH

RUN curl -fsSL https://bun.sh/install | bash -s -- "bun-v${BUN_VERSION}"

WORKDIR /build

# Shallow clone + checkout the requested ref
RUN git clone --depth 1 https://github.com/anomalyco/opencode.git . \
 && git fetch --depth 1 origin ${OPENCODE_REF} \
 && git checkout FETCH_HEAD

# Apply local patches
COPY docker-tools/patches/ /tmp/patches/
RUN set -eu; for p in /tmp/patches/*.patch; do \
      [ -f "$p" ] || continue; \
      echo ">>> applying $p"; \
      git apply --3way "$p"; \
    done

# Install workspace deps with the lockfile
RUN bun install --frozen-lockfile

# Build all targets; we only need the baseline-musl binary for the final image.
# --single is intentionally avoided because it skips the musl target, which
# would produce a glibc binary that cannot run on the alpine final stage.
RUN bun run --cwd packages/opencode build

# ---- Stage 2: final image ----
FROM alpine:${ALPINE_VERSION} AS final

ARG TARGETARCH
ARG OPENCODE_USER=opencode

# Runtime libs that match the upstream ghcr.io/anomalyco/opencode image
RUN apk add --no-cache libgcc libstdc++ ripgrep

# Install the freshly built opencode binary (baseline-musl for the target arch).
# Docker's TARGETARCH is amd64/arm64, but the opencode build script emits
# x64/arm64 in the dist directory name, so map amd64 -> x64.
ARG TARGETARCH
COPY --from=opencode-builder /build/packages/opencode/dist /build/packages/opencode/dist
RUN set -eu; \
    case "${TARGETARCH}" in \
      amd64) BIN_ARCH=x64 ;; \
      arm64) BIN_ARCH=arm64 ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    cp "/build/packages/opencode/dist/opencode-linux-${BIN_ARCH}-baseline-musl/bin/opencode" /usr/local/bin/opencode; \
    chmod +x /usr/local/bin/opencode; \
    opencode --version

ENV HOME=/home/${OPENCODE_USER}
ENV PATH="$PATH:${HOME}/.bun/bin:/app/bin"

RUN apk update && apk upgrade \
 && apk add --no-cache bash curl libc6-compat git nodejs npm g++ make python3

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
