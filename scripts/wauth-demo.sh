#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_DIR="$ROOT_DIR/demo/wauth-demo-ts"
DEFAULT_PORT="${PORT:-3000}"
DEFAULT_ISSUER="http://127.0.0.1:${DEFAULT_PORT}"
DEFAULT_RUNTIME_DIR="${WAUTH_DEMO_RUNTIME_DIR:-$ROOT_DIR/.wauth-demo-runtime}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/wauth-demo.sh setup
  ./scripts/wauth-demo.sh test
  ./scripts/wauth-demo.sh scenario
  ./scripts/wauth-demo.sh serve [--handoff|--local-happ] [--port PORT]
  ./scripts/wauth-demo.sh build-static
  ./scripts/wauth-demo.sh help

Commands:
  setup         Install demo dependencies.
  test          Run the demo test suite.
  scenario      Run the deterministic CLI tax scenario.
  serve         Start the local MCP + RP demo server.
  build-static  Build the static demo output into demo/wauth-demo-ts/dist.

Options for 'serve':
  --handoff     Force redirect-only HAPP handoff mode.
  --local-happ  Force local reference HAPP mode.
  --port PORT   Listen on a different local port. Default: 3000.

Environment:
  WAUTH_DEMO_RUNTIME_DIR       Override local runtime state directory.
  WAUTH_DEMO_HAPP_MODE         Override HAPP mode directly.
  WAUTH_DEMO_HAPP_BASE_URL     Override remote HAPP base URL in handoff mode.
  WAUTH_DEMO_STATE_FILE        Override workflow state file.
  WAUTH_DEMO_WAUTH_STATE_FILE  Override WAUTH request state file.
EOF
}

ensure_demo_dir() {
  if [[ ! -d "$DEMO_DIR" ]]; then
    echo "Demo directory not found: $DEMO_DIR" >&2
    exit 1
  fi
}

ensure_dependencies() {
  ensure_demo_dir
  if [[ ! -d "$DEMO_DIR/node_modules" ]]; then
    echo "Installing demo dependencies..."
    (cd "$DEMO_DIR" && npm install)
  fi
}

run_setup() {
  ensure_demo_dir
  (cd "$DEMO_DIR" && npm install)
}

run_test() {
  ensure_dependencies
  (cd "$DEMO_DIR" && npm test)
}

run_scenario() {
  ensure_dependencies
  (cd "$DEMO_DIR" && npm run demo)
}

run_build_static() {
  ensure_dependencies
  (cd "$DEMO_DIR" && npm run build:static)
}

run_serve() {
  ensure_dependencies

  local port="$DEFAULT_PORT"
  local happ_mode="${WAUTH_DEMO_HAPP_MODE:-}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --handoff)
        happ_mode="handoff"
        shift
        ;;
      --local-happ)
        happ_mode="local-ref"
        shift
        ;;
      --port)
        if [[ $# -lt 2 ]]; then
          echo "--port requires a value" >&2
          exit 1
        fi
        port="$2"
        shift 2
        ;;
      *)
        echo "Unknown serve option: $1" >&2
        usage
        exit 1
        ;;
    esac
  done

  mkdir -p "$DEFAULT_RUNTIME_DIR"

  export PORT="$port"
  export WAUTH_DEMO_ISSUER="${WAUTH_DEMO_ISSUER:-http://127.0.0.1:${port}}"
  export WAUTH_DEMO_STATE_FILE="${WAUTH_DEMO_STATE_FILE:-$DEFAULT_RUNTIME_DIR/workflow-state.json}"
  export WAUTH_DEMO_WAUTH_STATE_FILE="${WAUTH_DEMO_WAUTH_STATE_FILE:-$DEFAULT_RUNTIME_DIR/wauth-state.json}"

  if [[ -n "$happ_mode" ]]; then
    export WAUTH_DEMO_HAPP_MODE="$happ_mode"
  fi

  cat <<EOF
Starting WAUTH demo server
  Repo root:      $ROOT_DIR
  Demo dir:       $DEMO_DIR
  Port:           $PORT
  Issuer:         $WAUTH_DEMO_ISSUER
  HAPP mode:      ${WAUTH_DEMO_HAPP_MODE:-auto}
  Workflow state: $WAUTH_DEMO_STATE_FILE
  WAUTH state:    $WAUTH_DEMO_WAUTH_STATE_FILE

Open after startup:
  Landing pages:  http://127.0.0.1:${PORT}/
  MCP endpoint:   http://127.0.0.1:${PORT}/mcp
  Health check:   http://127.0.0.1:${PORT}/healthz
EOF

  (cd "$DEMO_DIR" && npm run serve:mcp)
}

main() {
  local command="${1:-help}"
  case "$command" in
    setup)
      shift
      run_setup "$@"
      ;;
    test)
      shift
      run_test "$@"
      ;;
    scenario)
      shift
      run_scenario "$@"
      ;;
    serve)
      shift
      run_serve "$@"
      ;;
    build-static)
      shift
      run_build_static "$@"
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      echo "Unknown command: $command" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
