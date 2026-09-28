import { describe, it } from "node:test";
import { network } from "hardhat";

describe("GreenLedger", async function () {
  const { viem } = await network.create();

  it("should allow issuer to issue a certificate", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");

    const owner = "0x0000000000000000000000000000000000000001";

    await viem.assertions.emitWithArgs(
      greenLedger.write.issueCertificate([
        "Hambantota Solar Farm",
        "Solar",
        1n,
        "2026-09",
        owner,
      ]),
      greenLedger,
      "CertificateIssued",
      [1n, owner, "Hambantota Solar Farm"],
    );
  });
  it("should reject certificate issuance from non-issuer", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");

    const wallets = await viem.getWalletClients();

    const nonIssuer = wallets[1];

    const greenLedgerAsNonIssuer = await viem.getContractAt(
      "GreenLedger",
      greenLedger.address,
      {
        client: {
          wallet: nonIssuer,
        },
      },
    );

    const owner = "0x0000000000000000000000000000000000000001";

    await viem.assertions.revertWith(
      greenLedgerAsNonIssuer.write.issueCertificate([
        "Hambantota Solar Farm",
        "Solar",
        1n,
        "2026-09",
        owner,
      ]),
      "Only issuer can issue certificates",
    );
  });
  it("should store certificate data correctly", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");

    const owner = "0x0000000000000000000000000000000000000001";

    await greenLedger.write.issueCertificate([
      "Hambantota Solar Farm",
      "Solar",
      1n,
      "2026-09",
      owner,
    ]);

    const certificate = await greenLedger.read.certificates([1n]);

    console.log(certificate);
  });
});
