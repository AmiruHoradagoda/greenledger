import { readFile, writeFile } from 'node:fs/promises'

const artifact = JSON.parse(await readFile(new URL('../../blockchain/artifacts/contracts/GreenLedger.sol/GreenLedger.json', import.meta.url), 'utf8'))
await writeFile(new URL('../src/greenLedgerAbi.ts', import.meta.url),
  `// Generated from the compiled GreenLedger artifact. Run npm run sync-abi after compiling.\nexport const greenLedgerAbi = ${JSON.stringify(artifact.abi, null, 2)} as const\n`)
console.log('GreenLedger ABI synchronized.')
