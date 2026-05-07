#!/bin/bash

cd /home/naru

bun_url="https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64-musl.zip"

mkdir -p /home/naru/.bun/bin

# install bun
curl -fsSL "$bun_url" -o bun.zip
unzip -o bun.zip
mv ./bun-linux-x64-musl/bun /home/naru/.bun/bin
ln -s /home/naru/.bun/bin/bun /home/naru/.bun/bin/bunx
rm -rf ./bun-linux-x64-musl bun.zip

bun i -g pnpm

cat <<'EOF' >>/home/naru/.bashrc
# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
EOF
