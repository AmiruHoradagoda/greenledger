import { network } from "hardhat";

const { viem } = await network.create({ network: "localhost" });
const publicClient = await viem.getPublicClient();
const wallets = await viem.getWalletClients();
const contractAddress = process.env.GREENLEDGER_ADDRESS;

if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
  throw new Error("Set a valid GREENLEDGER_ADDRESS");
}
const greenLedger = await viem.getContractAt(
  "GreenLedger",
  contractAddress as `0x${string}`,
);

const owner = wallets[1].account.address;
const generatorWallet = wallets[3]; // registered generator wallet (see register-generator.ts)
const generatorId = 1n;
const record = { source: "Solar", mwh: 1n, period: "2026-09", id: "HAMBANTOTA-SOLAR-2026-09-001" };

// The generator signs the generation record (EIP-712); the issuer submits it.
const previousFingerprint = await greenLedger.read.latestGeneratorFingerprint([generatorId]);
const signature = await generatorWallet.signTypedData({
  domain: {
    name: "GreenLedger",
    version: "1",
    chainId: await publicClient.getChainId(),
    verifyingContract: greenLedger.address,
  },
  types: {
    GenerationRecord: [
      { name: "generatorId", type: "uint256" },
      { name: "energySource", type: "string" },
      { name: "energyMWh", type: "uint256" },
      { name: "generationPeriod", type: "string" },
      { name: "generationRecordId", type: "string" },
      { name: "previousFingerprint", type: "bytes32" },
    ],
  },
  primaryType: "GenerationRecord",
  message: {
    generatorId,
    energySource: record.source,
    energyMWh: record.mwh,
    generationPeriod: record.period,
    generationRecordId: record.id,
    previousFingerprint,
  },
});

const hash = await greenLedger.write.issueCertificate([
  generatorId, record.source, record.mwh, record.period, owner, record.id, signature,
]);

await publicClient.waitForTransactionReceipt({ hash });

const certificate = await greenLedger.read.getCertificate([1n]);

console.log("Transaction:", hash);
console.log("Certificate #1:", certificate);
