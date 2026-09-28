import { network } from "hardhat";

const { viem } = await network.create({ network: "localhost" });
const publicClient = await viem.getPublicClient();
const wallets = await viem.getWalletClients();

const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const contractAsOwner = await viem.getContractAt(
  "GreenLedger",
  contractAddress,
  { client: { wallet: wallets[1] } },
);

const newOwner = wallets[2].account.address;

const hash = await contractAsOwner.write.transferCertificate([1n, newOwner]);
await publicClient.waitForTransactionReceipt({ hash });

const greenLedger = await viem.getContractAt("GreenLedger", contractAddress);
const certificate = await greenLedger.read.certificates([1n]);

console.log("Transaction:", hash);
console.log("New owner:", certificate[5]);
console.log("Expected owner:", newOwner);
