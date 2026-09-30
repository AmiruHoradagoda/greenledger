#!/usr/bin/env bash
# One-command demo: installs deps, starts a fresh local chain, deploys the
# contract, configures the frontend and starts it. Ctrl+C stops everything.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/.demo-logs"
mkdir -p "$LOG_DIR"
NODE_PID=""

cleanup() {
  [ -n "$NODE_PID" ] && kill "$NODE_PID" 2>/dev/null || true
  echo; echo "Stopped local blockchain."
}
trap cleanup EXIT INT TERM

command -v node >/dev/null || { echo "Node.js is required: https://nodejs.org"; exit 1; }

echo "1/5 Installing dependencies (first run takes a minute)..."
(cd "$ROOT/blockchain" && [ -d node_modules ] || npm ci --silent)
(cd "$ROOT/frontend" && [ -d node_modules ] || npm ci --silent)

echo "2/5 Compiling contract and syncing ABI..."
(cd "$ROOT/blockchain" && npx hardhat compile >"$LOG_DIR/compile.log" 2>&1) || { cat "$LOG_DIR/compile.log"; exit 1; }
(cd "$ROOT/frontend" && npm run --silent sync-abi >/dev/null)

echo "3/5 Starting a fresh local blockchain on 127.0.0.1:8545..."
if lsof -ti tcp:8545 >/dev/null 2>&1; then
  echo "    Port 8545 is busy; stopping the old process."
  lsof -ti tcp:8545 | xargs kill 2>/dev/null || true
  sleep 1
fi
(cd "$ROOT/blockchain" && exec npx hardhat node --hostname 127.0.0.1 >"$LOG_DIR/node.log" 2>&1) &
NODE_PID=$!
for _ in $(seq 1 60); do
  curl -s -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    http://127.0.0.1:8545 >/dev/null 2>&1 && break
  kill -0 "$NODE_PID" 2>/dev/null || { echo "Node failed to start:"; cat "$LOG_DIR/node.log"; exit 1; }
  sleep 1
done

echo "4/5 Deploying contract..."
rm -rf "$ROOT/blockchain/ignition/deployments/chain-31337"
DEPLOY_OUT="$(cd "$ROOT/blockchain" && npx hardhat ignition deploy ignition/modules/GreenLedger.ts --network localhost 2>&1)" \
  || { echo "$DEPLOY_OUT"; exit 1; }
ADDRESS="$(echo "$DEPLOY_OUT" | grep -Eo 'GreenLedgerModule#GreenLedger - 0x[0-9a-fA-F]{40}' | grep -Eo '0x[0-9a-fA-F]{40}')"
[ -n "$ADDRESS" ] || { echo "Could not read contract address:"; echo "$DEPLOY_OUT"; exit 1; }
printf 'VITE_GREENLEDGER_ADDRESS=%s\n' "$ADDRESS" >"$ROOT/frontend/.env.local"

# Demo account keys are public Hardhat test keys, safe for local use only.
KEYS="$(grep -E '^(Account #|Private Key:)' "$LOG_DIR/node.log" | head -6 || true)"

echo "5/5 Starting the website..."
cat <<MSG

  Contract deployed at: $ADDRESS
  Website:              http://localhost:5173
  MetaMask network:     RPC http://127.0.0.1:8545, chain ID 31337, symbol ETH
  Import these Hardhat accounts into MetaMask (#0 issuer, #1 owner, #2 recipient):
$KEYS

  Press Ctrl+C to stop.

MSG
lsof -ti tcp:5173 | xargs kill 2>/dev/null || true
cd "$ROOT/frontend" && npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
