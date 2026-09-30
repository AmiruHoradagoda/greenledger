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
  { client: { wallet: wallets[2] } },
);

const hash = await contractAsOwner.write.retireCertificate([1n]);
await publicClient.waitForTransactionReceipt({ hash });

const certificate = await contractAsOwner.read.getCertificate([1n]);

console.log("Transaction:", hash);
console.log("Certificate ID:", certificate.id);
console.log("Retired:", certificate.retired);
