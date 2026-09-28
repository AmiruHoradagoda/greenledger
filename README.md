# GreenLedger

**Module:** EC8204 Blockchain and Cyber Security

A blockchain-based Renewable Energy Certificate tracking system for issuing, transferring, and retiring renewable energy certificates while preventing reuse after retirement.

## Current status

Initial Hardhat project setup. The `blockchain/` directory contains the original Hardhat Counter sample, tests, and development configuration. GreenLedger functionality has not been implemented, and the frontend has not been added.

## Planned stack

- Solidity
- Hardhat
- TypeScript
- React (later)

## Development

Run these commands from the repository root with Node.js and npm installed:

```sh
cd blockchain
npm install
npx hardhat compile
npx hardhat test
```

The sample tests use a local simulated blockchain and do not require wallet credentials. Keep environment credentials out of Git; `.env.example` may be committed with placeholders only.

## Local demo

Run these commands from the `blockchain` directory. Keep the node running in its own terminal.

```powershell
npm install
npx hardhat test
npx hardhat node
```

In a second terminal, deploy the contract:

```powershell
npx hardhat ignition deploy ignition/modules/GreenLedger.ts --network localhost
```

Use the deployed address in the demo scripts. Then run them in order:

```powershell
npx hardhat run scripts/issue-certificate.ts --network localhost
npx hardhat run scripts/transfer-certificate.ts --network localhost
npx hardhat run scripts/retire-certificate.ts --network localhost

$env:GREENLEDGER_ADDRESS = "<deployed contract address>"
$env:CERTIFICATE_ID = "1"
npx hardhat run scripts/verify-certificate.ts --network localhost
```

Expected final status: `Retired`.

The scripts currently demonstrate Certificate #1: Account 0 issues it to Account 1, Account 1 transfers it to Account 2, and Account 2 retires it. The local blockchain state is cleared when the node stops.