FROM ghcr.io/anomalyco/opencode:latest 

# prepare directories
RUN ["mkdir", "-p", "/app/worktree"]
RUN ["mkdir", "-p", "/app/config"]

ENV PATH="$PATH:/home/naru/.bun/bin"

# install bash
RUN apk update && apk upgrade
RUN apk add --no-cache bash curl libc6-compat git nodejs npm

# add user
RUN adduser -D naru && addgroup naru naru
USER naru

RUN mkdir -p /home/naru/code/opencode

WORKDIR "/app"

# install bun
COPY install-bun.sh /app/install-bun.sh
RUN bash /app/install-bun.sh

# setup startup script
COPY start.sh /app/start.sh

ENTRYPOINT ["sh", "/app/start.sh"]
