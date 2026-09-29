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

const hash = await greenLedger.write.issueCertificate([
  "Hambantota Solar Farm",
  "Solar",
  1n,
  "2026-09",
  owner,
  "HAMBANTOTA-SOLAR-2026-09-001",
]);

await publicClient.waitForTransactionReceipt({ hash });

const certificate = await greenLedger.read.certificates([1n]);

console.log("Transaction:", hash);
console.log("Certificate #1:", certificate);
