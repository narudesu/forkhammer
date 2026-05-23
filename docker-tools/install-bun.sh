#!/bin/bash
set -eu

: "${HOME:?HOME must be set}"

cd "$HOME"

bun_url="https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64-musl.zip"

mkdir -p "$HOME/.bun/bin"

# install bun
curl -fsSL "$bun_url" -o bun.zip
unzip -o bun.zip
mv ./bun-linux-x64-musl/bun "$HOME/.bun/bin"
ln -s "$HOME/.bun/bin/bun" "$HOME/.bun/bin/bunx"
rm -rf ./bun-linux-x64-musl bun.zip

bun i -g pnpm

cat <<'EOF' >>"$HOME/.bashrc"
# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
EOF
