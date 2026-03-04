#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

printf "\n[wauth-ts] install + test\n"
cd "$ROOT_DIR/sdk/wauth-ts"
npm install
npm test

printf "\n[wauth-py] test\n"
cd "$ROOT_DIR/sdk/wauth-py"
python3 -m unittest discover -s tests -p 'test_*.py' -v

printf "\n[wauth-rs] test\n"
cd "$ROOT_DIR/sdk/wauth-rs"
cargo test --all-features
