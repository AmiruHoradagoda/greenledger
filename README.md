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
