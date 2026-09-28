import { network } from "hardhat";

const { viem } = await network.create({ network: "localhost" });

const greenLedger = await viem.getContractAt(
  "GreenLedger",
  "0x5FbDB2315678afecb367f032d93F642f64180aa3",
);

const certificate = await greenLedger.read.getCertificate([1n]);

console.log("ID:", certificate.id);
console.log("Generator:", certificate.generatorName);
console.log("Source:", certificate.energySource);
console.log("Energy (MWh):", certificate.energyMWh);
console.log("Period:", certificate.generationPeriod);
console.log("Current owner:", certificate.owner);
console.log("Status:", certificate.retired ? "Retired" : "Active");
