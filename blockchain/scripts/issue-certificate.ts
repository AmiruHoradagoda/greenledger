import { network } from "hardhat";

const { viem } = await network.create({ network: "localhost" });
const publicClient = await viem.getPublicClient();
const wallets = await viem.getWalletClients();

const greenLedger = await viem.getContractAt(
  "GreenLedger",
  "0x5FbDB2315678afecb367f032d93F642f64180aa3",
);

const owner = wallets[1].account.address;

const hash = await greenLedger.write.issueCertificate([
  "Hambantota Solar Farm",
  "Solar",
  1n,
  "2026-09",
  owner,
]);

await publicClient.waitForTransactionReceipt({ hash });

const certificate = await greenLedger.read.certificates([1n]);

console.log("Transaction:", hash);
console.log("Certificate #1:", certificate);
