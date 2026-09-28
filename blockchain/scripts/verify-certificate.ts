import { network } from "hardhat";

const { viem } = await network.create({ network: "localhost" });
const contractAddress = process.env.GREENLEDGER_ADDRESS;

if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
  throw new Error("Set a valid GREENLEDGER_ADDRESS");
}
const greenLedger = await viem.getContractAt(
  "GreenLedger",
  contractAddress as `0x${string}`,
);

const idText = process.env.CERTIFICATE_ID;

if (!idText || !/^[1-9]\d*$/.test(idText)) {
  throw new Error("Provide a positive certificate ID");
}

const certificate = await greenLedger.read.getCertificate([BigInt(idText)]);

console.log("ID:", certificate.id);
console.log("Generator:", certificate.generatorName);
console.log("Source:", certificate.energySource);
console.log("Energy (MWh):", certificate.energyMWh);
console.log("Period:", certificate.generationPeriod);
console.log("Current owner:", certificate.owner);
console.log("Status:", certificate.retired ? "Retired" : "Active");
