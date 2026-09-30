# GreenLedger

A prototype for issuing, transferring, retiring, and verifying renewable energy certificates on a local blockchain.

The smart contract, tests, and local demo are in [`blockchain/`](blockchain/). See the [blockchain README](blockchain/README.md) for setup and commands.

The single-page React + TypeScript demo is in [`frontend/`](frontend/). It uses Viem for wallet-free certificate verification and MetaMask for issuance, transfers, and retirement. Security analysis: [THREAT_MODEL.md](THREAT_MODEL.md). See the [frontend setup and presentation guide](frontend/README.md) for local deployment, environment configuration, and demo account setup.

## One-command start (macOS / Linux)

```bash
./run.sh        # or: npm run demo
```

Installs dependencies, starts a fresh local chain, deploys the contract, writes `frontend/.env.local`, prints the demo account keys and starts the site at http://localhost:5173. Press Ctrl+C to stop. You still need MetaMask with the Hardhat Local network and the printed accounts imported.

## Manual start (macOS / Linux)

The per-folder READMEs show PowerShell commands; these are the zsh/bash equivalents. Use three terminals, starting from the repository root.

```bash
# Terminal 1: local chain (leave running)
cd blockchain && npm ci && npx hardhat node --hostname 127.0.0.1

# Terminal 2: tests, deploy, frontend config
cd blockchain
npx hardhat test
rm -rf ignition/deployments/chain-31337        # only when using a fresh node
npx hardhat ignition deploy ignition/modules/GreenLedger.ts --network localhost
# note the GreenLedgerModule#GreenLedger address printed

cd ../frontend && npm ci && npm run sync-abi
cp .env.example .env.local                     # set VITE_GREENLEDGER_ADDRESS to the deployed address

# Terminal 3: frontend
cd frontend && npm run dev                     # open http://localhost:5173
```

Optional CLI demo (instead of the browser): `export GREENLEDGER_ADDRESS=<address>`, then run the `issue`, `transfer`, `retire` and `verify` scripts in `blockchain/scripts` with `npx hardhat run scripts/<name>.ts --network localhost` (for verify, also `export CERTIFICATE_ID=1`).

For the browser demo, import Hardhat accounts #0–#3 into MetaMask and add the Hardhat Local network (RPC `http://127.0.0.1:8545`, chain ID `31337`) as described in [`frontend/README.md`](frontend/README.md).
