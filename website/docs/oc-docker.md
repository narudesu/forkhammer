---
sidebar_position: 3
---

# `tools/oc-docker`

This repo includes the Docker Compose stack used to run the OpenCode server inside Docker.

The paths are intentionally fixed:

- `XDG_DATA_HOME=/home/naru/code/opencode`
- `OPENCODE_CONFIG_DIR=/home/naru/code/opencode/config`
- volume mount `/home/naru/code/opencode:/home/naru/code/opencode`

Start it with `docker compose -f tools/oc-docker/docker-compose.yml up --build`.
