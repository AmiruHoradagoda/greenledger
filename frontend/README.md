# GreenLedger demo frontend

A responsive React + TypeScript page for public certificate verification and issuer/current-owner actions. Uses Viem and an ABI exported from the compiled GreenLedger contract. Public reads use `http://127.0.0.1:8545` without a wallet. Writes use the account connected through MetaMask, simulate the call, request wallet confirmation, and wait for the transaction receipt before displaying success and its hash.

## Start the local demo

Use Node.js and npm compatible with the repository dependencies. The commands below use PowerShell from `E:\greenledger`. If script execution policy blocks `npm` or `npx`, use `npm.cmd` or `npx.cmd`.

1. Start a fresh Hardhat node in Terminal 1 and leave it running:

   ```powershell
   cd E:\greenledger\blockchain
   npm ci
   npx hardhat compile
   npx hardhat node --hostname 127.0.0.1
   ```

   Stop an existing local demo node before starting a fresh one. Restarting resets its blockchain state.

2. In Terminal 2, clear an earlier local deployment record **only when deploying to a fresh node**, then deploy:

   ```powershell
   cd E:\greenledger\blockchain
   if (Test-Path .\ignition\deployments\chain-31337) {
     Remove-Item -LiteralPath .\ignition\deployments\chain-31337 -Recurse -Force
   }
   npx hardhat ignition deploy ignition/modules/GreenLedger.ts --network localhost
   ```

   Copy the address printed for `GreenLedgerModule#GreenLedger`. Account 0 is the issuer. For the browser presentation, issue through the frontend rather than running the lifecycle scripts first.

3. Configure and start the frontend:

   ```powershell
   cd E:\greenledger\frontend
   npm ci
   npm run sync-abi
   Copy-Item .env.example .env.local
   ```

   Edit `.env.local` to contain the address from step 2:

   ```dotenv
   VITE_GREENLEDGER_ADDRESS=0xYourDeployedContractAddress
   ```

   The address in `.env.example` is the usual first deployment address on a fresh Hardhat node; always confirm it against the deployment output. `.env.local` is ignored by Git. All `VITE_` variables are public browser configuration: never put private keys, seed phrases, or credentials there.

   ```powershell
   npm run dev
   ```

   Open the local URL printed by Vite (usually `http://localhost:5173`). Restart Vite after changing `.env.local`. Keep both the node and Vite running on the same computer as the browser.

## MetaMask and demo accounts

Install the MetaMask browser extension. Click **Connect MetaMask**, approve account access, then **Switch to Hardhat** if prompted. The page requests a network switch and offers to add the network if it is unknown. To add it manually, use MetaMask's custom network settings:

| Setting | Value |
| --- | --- |
| Network name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |
| Block explorer | Leave blank |

See MetaMask's [custom network instructions](https://support.metamask.io/configure/networks/how-to-add-a-custom-network-rpc).

In MetaMask's account menu, choose the option to add/import an account, select **Private key**, and paste the key for **Account #0** printed by your local Hardhat node. Repeat for **Account #1** and **Account #2**, naming them Demo issuer, Demo owner, and Demo recipient. These are publicly known development accounts: use them only on the local chain, never for real funds. Import keys only into MetaMask, never into the frontend, source files, or environment files. MetaMask documents the [account import flow](https://support.metamask.io/start/use-an-existing-wallet).

Connect/authorize these accounts for the Vite site. When changing accounts, select the desired account in MetaMask and make sure it is connected to the site; the address displayed on the page should change. MetaMask's labels may differ from Hardhat's zero-based numbering. Match addresses:

| Hardhat account | Demo role | Default address |
| --- | --- | --- |
| #0 | Issuer/deployer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| #1 | Initial owner | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| #2 | Transfer recipient | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |

## Three-minute presentation

1. Connect Account #0 on Hardhat Local. The issuer form becomes available. Use the preset generator, Solar, 1 MWh, and September 2026; enter a new generation record ID such as `HAMBANTOTA-SOLAR-2026-09-UI-001` and Account #1's address as the initial owner. Click **Issue certificate**, confirm in MetaMask, and show the success message and transaction hash.
2. The issued certificate loads automatically using its ID from the issuance event. Show all details and **Active** status. Verification also works in a browser without MetaMask: enter the same certificate ID and click **Verify**.
3. Select Account #1 in MetaMask. Enter Account #2's address under Owner actions, transfer, and confirm. Show the updated owner and transaction hash.
4. Select Account #2. Click **Retire permanently**, acknowledge the irreversible action, and confirm in MetaMask. Show **Retired**, the transaction hash, and disabled owner actions.

To demonstrate duplicate protection, switch back to Account #0 and submit the same generation record ID again. The contract revert is shown before wallet signing. Use a new ID for each additional certificate. If the command-line demo was already run, certificate #1 may be retired; issue a new certificate instead.

## Extra features

- **Audit trail:** each verified certificate lists its issue, transfer, retire and revoke events with block numbers (Etherscan links on Sepolia).
- **Share link and QR:** `?id=N` in the URL verifies that certificate on load, with no wallet. Use **Copy verify link** or scan the QR code.
- **My certificates:** with a wallet connected, the account's current certificates appear as one-click chips.
- **Revoke:** the issuer can revoke the displayed certificate with a reason.
- **Sepolia:** set `VITE_NETWORK=sepolia` (see `.env.example`) to use the public testnet.

## Checks and ABI updates

```powershell
npm run build
npm run lint
```

After changing the Solidity contract, compile it in `blockchain/`, run `npm run sync-abi` in `frontend/`, and redeploy as appropriate. `src/greenLedgerAbi.ts` is a committed, typed export of the full compiled ABI; no contract bytecode or private keys are bundled. Builds use this file and do not require Hardhat artifacts to exist on a fresh frontend-only install.

## Limits and troubleshooting

- This is a local demo, with no backend, database, or authentication service. Contract permissions determine who can write. The UI disables unavailable actions, and the contract remains authoritative.
- Missing address, missing contract, unreachable RPC, wrong wallet network, invalid input, rejected signatures, and contract reverts have visible messages. If a submitted transaction times out, check its receipt in MetaMask before retrying.
- The contract accepts whole positive MWh, and a non-empty, case-sensitive generation record ID. The form trims surrounding whitespace. Unique IDs prevent reuse within this contract, but do not independently verify energy measurements or detect the same energy under different IDs.
- Records refresh after successful writes from this page or when you click Verify; changes made elsewhere are not streamed live. Wallet account and network changes update the controls.
- A node restart clears all certificates. Redeploy, check `.env.local`, and restart Vite. If MetaMask has pending transactions/nonces from the old local chain, clear its activity/nonce data for the local demo account before retrying.
- Use a desktop browser with MetaMask enabled as the injected wallet. Wallet prompts require manual approval. Mobile MetaMask, remote RPCs, and production networks are outside this demo's scope.

Contract interaction follows Viem's [wallet client](https://viem.sh/docs/clients/wallet) and [write contract](https://viem.sh/docs/contract/writeContract) APIs.
