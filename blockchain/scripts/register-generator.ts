import { network } from "hardhat";

// Registers the demo generator (Hardhat account #3 signs its records) if none exists yet.
const { viem } = await network.create({ network: "localhost" });
const publicClient = await viem.getPublicClient();
const wallets = await viem.getWalletClients();
const contractAddress = process.env.GREENLEDGER_ADDRESS;

if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
  throw new Error("Set a valid GREENLEDGER_ADDRESS");
}
const greenLedger = await viem.getContractAt("GreenLedger", contractAddress as `0x${string}`);

if ((await greenLedger.read.generatorCount()) === 0n) {
  const hash = await greenLedger.write.registerGenerator([
    "Hambantota Solar Farm",
    wallets[3].account.address,
  ]);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("Registered generator #1 (Hambantota Solar Farm) with wallet", wallets[3].account.address);
} else {
  console.log("A generator is already registered.");
}
