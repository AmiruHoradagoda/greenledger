import { network } from "hardhat";

const { viem } = await network.create({ network: "localhost" });
const publicClient = await viem.getPublicClient();
const wallets = await viem.getWalletClients();

const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const contractAsOwner = await viem.getContractAt(
  "GreenLedger",
  contractAddress,
  { client: { wallet: wallets[2] } },
);

const hash = await contractAsOwner.write.retireCertificate([1n]);
await publicClient.waitForTransactionReceipt({ hash });

const certificate = await contractAsOwner.read.certificates([1n]);

console.log("Transaction:", hash);
console.log("Certificate ID:", certificate[0]);
console.log("Retired:", certificate[7]);
