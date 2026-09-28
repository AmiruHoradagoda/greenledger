import { network } from "hardhat";

const { viem } = await network.create({ network: "localhost" });
const publicClient = await viem.getPublicClient();
const wallets = await viem.getWalletClients();
const contractAddress = process.env.GREENLEDGER_ADDRESS;

if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
  throw new Error("Set a valid GREENLEDGER_ADDRESS");
}

const contractAsOwner = await viem.getContractAt(
  "GreenLedger",
  contractAddress as `0x${string}`,
  { client: { wallet: wallets[1] } },
);

const newOwner = wallets[2].account.address;

const hash = await contractAsOwner.write.transferCertificate([1n, newOwner]);
await publicClient.waitForTransactionReceipt({ hash });

const greenLedger = await viem.getContractAt(
  "GreenLedger",
  contractAddress as `0x${string}`,
);
const certificate = await greenLedger.read.certificates([1n]);

console.log("Transaction:", hash);
console.log("New owner:", certificate[5]);
console.log("Expected owner:", newOwner);
