# GreenLedger smart contract

GreenLedger is a Hardhat 3 prototype for tracking renewable energy certificates. An authorized issuer creates a certificate, its current owner can transfer it, and the owner can retire it after use. Anyone can read a certificate's current owner and retirement status.

This `blockchain` directory contains the Solidity contract, automated tests, a local deployment module, and small scripts for a complete local demo.

## Certificate lifecycle

| Action   | Who can call it                                | Result                                                                                                                     |
| -------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Issue    | Issuer (the account that deploys the contract) | Creates a certificate with a unique ID, generator name, energy source, energy amount in MWh, generation period, and owner. |
| Transfer | Current owner                                  | Changes the owner and emits `CertificateTransferred`. A retired certificate cannot be transferred.                         |
| Retire   | Current owner                                  | Marks the certificate as retired and emits `CertificateRetired`. It cannot be retired twice.                               |
| Verify   | Anyone                                         | Reads the certificate details, current owner, and `retired` status.                                                        |

Issuing rejects a zero owner address and zero energy amount. Transfers reject nonexistent certificates and a zero destination address. Each state change emits an event. The contract is in `contracts/GreenLedger.sol`.

## Requirements

- Node.js and npm compatible with the dependencies in `package.json`
- A PowerShell terminal for the commands below (or equivalent environment-variable syntax in another shell)

Run all commands from the `blockchain` directory. Install dependencies and run the tests:

```powershell
npm ci
npx hardhat test
```

The tests cover issuing and its access control, stored certificate data, authorized and unauthorized transfers, retirement, repeated retirement, and transfers after retirement.

## Local demo

Use a fresh local node and follow these steps in order. The scripts demonstrate **Certificate #1** using Hardhat's local accounts: Account 0 issues it to Account 1; Account 1 transfers it to Account 2; Account 2 retires it.

**Terminal 1 — start the node and leave it running:**

```powershell
npx hardhat node
```

**Terminal 2 — deploy the contract:**

If `ignition/deployments/chain-31337` exists from an earlier run, remove that local deployment record before deploying to a fresh node:

```powershell
Remove-Item -Recurse -Force .\ignition\deployments\chain-31337
```

This deletes only the local Ignition deployment record, not the contract source. Then deploy:

```powershell
npx hardhat ignition deploy ignition/modules/GreenLedger.ts --network localhost
```

Copy `GreenLedgerModule#GreenLedger` from the deployed addresses in the output. Set it in the same Terminal 2 session:

```powershell
$env:GREENLEDGER_ADDRESS = "<deployed contract address>"
```

Run the lifecycle scripts in order:

```powershell
npx hardhat run scripts/issue-certificate.ts --network localhost
npx hardhat run scripts/transfer-certificate.ts --network localhost
npx hardhat run scripts/retire-certificate.ts --network localhost
```

Finally, verify Certificate #1:

```powershell
$env:CERTIFICATE_ID = "1"
npx hardhat run scripts/verify-certificate.ts --network localhost
```

The final output should show `Status: Retired` and Account 2 as the current owner. `GREENLEDGER_ADDRESS` must be set in the terminal that runs the scripts. The issue, transfer, and retire demo scripts use Certificate #1 and local accounts 0–2; run this sequence once on a fresh deployment. The verify script accepts another positive certificate ID through `CERTIFICATE_ID`.

The local node's blockchain state is temporary. Stopping or restarting it clears certificates and transactions. Remove the prior local Ignition deployment record and redeploy before repeating the demo.

## Scope

This is a learning prototype. Certificate details are supplied by the issuer; the contract does not independently measure energy production or verify the generator's evidence. It is not an ERC-721 token or a production registry.
