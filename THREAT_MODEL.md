# GreenLedger threat model and security review

Scope: `blockchain/contracts/GreenLedger.sol` and the React frontend. Method: manual review, 19 unit tests (100% line/statement coverage via `npx hardhat test --coverage`), and Slither 0.11.6 (`slither contracts/GreenLedger.sol --solc-args "--via-ir --optimize"`: 1 informational note, the inline assembly used to split the signature into r, s, v).

## Assets and actors
- **Assets:** integrity of certificate records, uniqueness of each generation record, correct ownership, irreversibility of retirement.
- **Actors:** issuer (trusted registry operator), certificate owners, public verifiers, attackers.

## Threats and mitigations

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| 1 | Non-issuer mints certificates | `onlyIssuer` on issue, revoke, pause, registry and issuer-transfer; tested | Issuer key compromise alone can no longer mint (see 14) |
| 2 | Issuer key lost or rotated | Two-step `transferIssuer` / `acceptIssuer`, so a typo cannot hand control to an address nobody controls | Compromised key can still act until rotated |
| 3 | Double counting: same energy certified twice | Each `generationRecordId` can issue once, permanently (survives transfer, retirement, revocation) | Same energy under a different ID is not detected; needs an off-chain registry link |
| 4 | Certificate issued in error | Issuer `revokeCertificate` with an on-chain reason; blocks transfer and retirement | Issuer is trusted; retired certificates cannot be revoked |
| 5 | Stolen or unauthorised transfer / retirement | Only the current owner may transfer or retire; tested | Owner key compromise |
| 6 | Reuse after retirement | Retired certificates cannot be transferred, retired or revoked | None |
| 7 | Reentrancy | No ether or external calls | None |
| 8 | Integer overflow | Solidity 0.8 checked arithmetic | None |
| 9 | Front-running | Actions are valid only for the sender's own certificate or the issuer, so ordering gives no gain. A public mempool observer could take a record ID first only if they are the issuer | Low |
| 10 | Tampered frontend shows false data | Contract is authoritative; writes are simulated then confirmed in the wallet; verify links read straight from the chain | User must trust the site they load |
| 11 | Zero address / zero energy / empty ID | Explicit `require` checks; tested | None |
| 12 | Forged or altered certificate details shown to a verifier | Issuance stores a keccak256 fingerprint of generator, source, MWh, period and record ID; the UI validates from the certificate ID alone: it recomputes the hash from the on-chain fields, confirms the issuer, record uniqueness and ownership trail, and shows expected vs found for each check | Owner is not in the hash; an issuer can still issue false data |
| 13 | Records inserted, removed or back-dated in a generator's history | Each certificate's fingerprint includes the previous certificate's fingerprint (`previousFingerprint`), forming a hash-linked chain per generator; the UI re-hashes the whole chain and flags broken links and missing months | The issuer can still append false records at the head; the chain proves continuity, not truth |
| 14 | Denial of service | No loops over user-controlled data | Gas cost of long strings is paid by the issuer |

## Known limitations
- The contract cannot check that the energy was really generated. The issuer is a trusted oracle. A production system would use signed meter data or an oracle.
- All data is public on-chain by design. Do not store personal data.
- Record IDs are exact strings (case-sensitive). Normalise IDs off-chain before issuing.
- Not an ERC-721 token; there is no marketplace or approval mechanism.
