import assert from "node:assert/strict";
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

    assert.equal(certificate[0], 1n);
    assert.equal(certificate[1], "Hambantota Solar Farm");
    assert.equal(certificate[2], "Solar");
    assert.equal(certificate[3], 1n);
    assert.equal(certificate[4], "2026-09");
    assert.equal(certificate[5].toLowerCase(), owner.toLowerCase());
    assert.equal(certificate[6], true);
  });
  it("should allow the owner to transfer a certificate", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const wallets = await viem.getWalletClients();
    const owner = wallets[1];
    const newOwner = wallets[2];

    await greenLedger.write.issueCertificate([
      "Hambantota Solar Farm",
      "Solar",
      1n,
      "2026-09",
      owner.account.address,
    ]);

    const contractAsOwner = await viem.getContractAt(
      "GreenLedger",
      greenLedger.address,
      { client: { wallet: owner } },
    );

    await viem.assertions.emitWithArgs(
      contractAsOwner.write.transferCertificate([1n, newOwner.account.address]),
      greenLedger,
      "CertificateTransferred",
      [1n, owner.account.address, newOwner.account.address],
    );

    const certificate = await greenLedger.read.certificates([1n]);
    assert.equal(
      certificate[5].toLowerCase(),
      newOwner.account.address.toLowerCase(),
    );
  });
  it("should reject transfer from a non-owner", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const wallets = await viem.getWalletClients();
    const owner = wallets[1];
    const nonOwner = wallets[2];
    const newOwner = wallets[3];

    await greenLedger.write.issueCertificate([
      "Hambantota Solar Farm",
      "Solar",
      1n,
      "2026-09",
      owner.account.address,
    ]);

    const contractAsNonOwner = await viem.getContractAt(
      "GreenLedger",
      greenLedger.address,
      { client: { wallet: nonOwner } },
    );

    await viem.assertions.revertWith(
      contractAsNonOwner.write.transferCertificate([
        1n,
        newOwner.account.address,
      ]),
      "Only owner can transfer",
    );
  });
  it("should allow the owner to retire a certificate", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const wallets = await viem.getWalletClients();
    const owner = wallets[1];

    await greenLedger.write.issueCertificate([
      "Hambantota Solar Farm",
      "Solar",
      1n,
      "2026-09",
      owner.account.address,
    ]);

    const contractAsOwner = await viem.getContractAt(
      "GreenLedger",
      greenLedger.address,
      { client: { wallet: owner } },
    );

    await viem.assertions.emitWithArgs(
      contractAsOwner.write.retireCertificate([1n]),
      greenLedger,
      "CertificateRetired",
      [1n, owner.account.address],
    );

    const certificate = await greenLedger.read.certificates([1n]);
    assert.equal(certificate[7], true);
  });
  it("should reject retiring a certificate twice", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const owner = (await viem.getWalletClients())[1];

    await greenLedger.write.issueCertificate([
      "Hambantota Solar Farm",
      "Solar",
      1n,
      "2026-09",
      owner.account.address,
    ]);

    const contractAsOwner = await viem.getContractAt(
      "GreenLedger",
      greenLedger.address,
      { client: { wallet: owner } },
    );

    await contractAsOwner.write.retireCertificate([1n]);

    await viem.assertions.revertWith(
      contractAsOwner.write.retireCertificate([1n]),
      "Certificate already retired",
    );
  });
  it("should reject transfer of a retired certificate", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const wallets = await viem.getWalletClients();
    const owner = wallets[1];
    const newOwner = wallets[2];

    await greenLedger.write.issueCertificate([
      "Hambantota Solar Farm",
      "Solar",
      1n,
      "2026-09",
      owner.account.address,
    ]);

    const contractAsOwner = await viem.getContractAt(
      "GreenLedger",
      greenLedger.address,
      { client: { wallet: owner } },
    );

    await contractAsOwner.write.retireCertificate([1n]);

    await viem.assertions.revertWith(
      contractAsOwner.write.transferCertificate([1n, newOwner.account.address]),
      "Cannot transfer retired certificate",
    );
  });
  it("should reject retirement from a non-owner", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const wallets = await viem.getWalletClients();
    const owner = wallets[1];
    const nonOwner = wallets[2];

    await greenLedger.write.issueCertificate([
      "Hambantota Solar Farm",
      "Solar",
      1n,
      "2026-09",
      owner.account.address,
    ]);

    const contractAsNonOwner = await viem.getContractAt(
      "GreenLedger",
      greenLedger.address,
      { client: { wallet: nonOwner } },
    );

    await viem.assertions.revertWith(
      contractAsNonOwner.write.retireCertificate([1n]),
      "Only owner can retire",
    );
  });
});
