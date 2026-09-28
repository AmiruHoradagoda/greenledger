import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("GreenLedgerModule", (m) => {
  const greenLedger = m.contract("GreenLedger");

  return { greenLedger };
});
