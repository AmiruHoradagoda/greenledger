import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { encodeAbiParameters, keccak256 } from "viem";

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
        "HAMBANTOTA-SOLAR-2026-09-001",
      ]),
      greenLedger,
      "CertificateIssued",
      [1n, owner, "Hambantota Solar Farm", 1n, "HAMBANTOTA-SOLAR-2026-09-001"],
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
        "HAMBANTOTA-SOLAR-2026-09-001",
      ]),
      "Only issuer can call this",
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
      "HAMBANTOTA-SOLAR-2026-09-001",
    ]);

    const certificate = await greenLedger.read.certificates([1n]);

    assert.equal(certificate[0], 1n);
    assert.equal(certificate[1], "Hambantota Solar Farm");
    assert.equal(certificate[2], "Solar");
    assert.equal(certificate[3], 1n);
    assert.equal(certificate[4], "2026-09");
    assert.equal(certificate[5].toLowerCase(), owner.toLowerCase());
    assert.equal(certificate[6], true);
    assert.equal(certificate[8], "HAMBANTOTA-SOLAR-2026-09-001");
  });
  it("should reject duplicate generation record issuance", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const owner = "0x0000000000000000000000000000000000000001";
    const args = [
      "Hambantota Solar Farm", "Solar", 1n, "2026-09", owner,
      "HAMBANTOTA-SOLAR-2026-09-001",
    ] as const;

    await greenLedger.write.issueCertificate(args);
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate(args),
      "Generation record already issued",
    );
    assert.equal(await greenLedger.read.nextCertificateId(), 2n);

    // A distinct external record can still be issued.
    await greenLedger.write.issueCertificate([
      "Hambantota Solar Farm", "Solar", 1n, "2026-09", owner,
      "HAMBANTOTA-SOLAR-2026-09-002",
    ]);
    const secondCertificate = await greenLedger.read.getCertificate([2n]);
    assert.equal(secondCertificate.generationRecordId, "HAMBANTOTA-SOLAR-2026-09-002");
  });
  it("should reject an empty generation record ID", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const owner = "0x0000000000000000000000000000000000000001";

    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([
        "Hambantota Solar Farm", "Solar", 1n, "2026-09", owner, "",
      ]),
      "Generation record ID is required",
    );
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
      "HAMBANTOTA-SOLAR-2026-09-001",
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
      "HAMBANTOTA-SOLAR-2026-09-001",
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
      "HAMBANTOTA-SOLAR-2026-09-001",
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
      "HAMBANTOTA-SOLAR-2026-09-001",
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
      "HAMBANTOTA-SOLAR-2026-09-001",
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
      "HAMBANTOTA-SOLAR-2026-09-001",
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

  const owner1 = "0x0000000000000000000000000000000000000001";
  const issueArgs = (record: string, to: string = owner1) =>
    ["Hambantota Solar Farm", "Solar", 1n, "2026-09", to, record] as [
      string, string, bigint, string, `0x${string}`, string,
    ];
  const as = (address: `0x${string}`, wallet: unknown) =>
    viem.getContractAt("GreenLedger", address, { client: { wallet: wallet as never } });

  it("should reject zero owner and zero energy on issuance", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate(issueArgs("R-1", "0x0000000000000000000000000000000000000000")),
      "Invalid owner address",
    );
    const args = issueArgs("R-2");
    args[2] = 0n;
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate(args),
      "Energy amount must be greater than zero",
    );
  });

  it("should reject transfer to the zero address and of a missing certificate", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const [, ownerWallet] = await viem.getWalletClients();
    await greenLedger.write.issueCertificate(issueArgs("R-1", ownerWallet.account.address));
    const asOwner = await as(greenLedger.address, ownerWallet);
    await viem.assertions.revertWith(
      asOwner.write.transferCertificate([1n, "0x0000000000000000000000000000000000000000"]),
      "Invalid new owner address",
    );
    await viem.assertions.revertWith(
      asOwner.write.transferCertificate([99n, owner1]),
      "Certificate does not exist",
    );
  });

  it("should not let record-ID reuse succeed after transfer or retirement", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const [, ownerWallet] = await viem.getWalletClients();
    await greenLedger.write.issueCertificate(issueArgs("R-1", ownerWallet.account.address));
    const asOwner = await as(greenLedger.address, ownerWallet);
    await asOwner.write.retireCertificate([1n]);
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate(issueArgs("R-1")),
      "Generation record already issued",
    );
    // IDs are case-sensitive.
    await greenLedger.write.issueCertificate(issueArgs("r-1"));
  });

  it("should rotate the issuer in two steps", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const [issuerWallet, , newIssuerWallet, strangerWallet] = await viem.getWalletClients();
    const newIssuer = newIssuerWallet.account.address;

    await viem.assertions.revertWith(
      greenLedger.write.transferIssuer(["0x0000000000000000000000000000000000000000"]),
      "Invalid issuer address",
    );
    await viem.assertions.revertWith(
      (await as(greenLedger.address, strangerWallet)).write.transferIssuer([newIssuer]),
      "Only issuer can call this",
    );

    await viem.assertions.emitWithArgs(
      greenLedger.write.transferIssuer([newIssuer]),
      greenLedger,
      "IssuerTransferStarted",
      [issuerWallet.account.address, newIssuer],
    );
    // Nomination alone changes nothing.
    assert.equal((await greenLedger.read.issuer()).toLowerCase(), issuerWallet.account.address.toLowerCase());

    const asNew = await as(greenLedger.address, newIssuerWallet);
    await viem.assertions.revertWith(
      (await as(greenLedger.address, strangerWallet)).write.acceptIssuer(),
      "Only pending issuer can accept",
    );
    await viem.assertions.emitWithArgs(
      asNew.write.acceptIssuer(),
      greenLedger,
      "IssuerTransferred",
      [issuerWallet.account.address, newIssuer],
    );
    assert.equal((await greenLedger.read.issuer()).toLowerCase(), newIssuer.toLowerCase());

    // Old issuer lost the right; new issuer has it.
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate(issueArgs("R-1")),
      "Only issuer can call this",
    );
    await asNew.write.issueCertificate(issueArgs("R-1"));
  });

  it("should let the issuer revoke, and block transfer/retire afterwards", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const [issuerWallet, ownerWallet, otherWallet] = await viem.getWalletClients();
    await greenLedger.write.issueCertificate(issueArgs("R-1", ownerWallet.account.address));
    const asOwner = await as(greenLedger.address, ownerWallet);

    await viem.assertions.revertWith(
      asOwner.write.revokeCertificate([1n, "mistake"]),
      "Only issuer can call this",
    );
    await viem.assertions.revertWith(
      greenLedger.write.revokeCertificate([99n, "x"]),
      "Certificate does not exist",
    );
    await viem.assertions.emitWithArgs(
      greenLedger.write.revokeCertificate([1n, "Meter reading error"]),
      greenLedger,
      "CertificateRevoked",
      [1n, issuerWallet.account.address, "Meter reading error"],
    );
    assert.equal((await greenLedger.read.getCertificate([1n])).revoked, true);
    await viem.assertions.revertWith(
      greenLedger.write.revokeCertificate([1n, "again"]),
      "Certificate already revoked",
    );
    await viem.assertions.revertWith(
      asOwner.write.transferCertificate([1n, otherWallet.account.address]),
      "Certificate revoked",
    );
    await viem.assertions.revertWith(
      asOwner.write.retireCertificate([1n]),
      "Certificate revoked",
    );
    // The record ID stays consumed so it cannot be re-issued.
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate(issueArgs("R-1")),
      "Generation record already issued",
    );
  });

  it("should not allow revoking a retired certificate", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    const [, ownerWallet] = await viem.getWalletClients();
    await greenLedger.write.issueCertificate(issueArgs("R-1", ownerWallet.account.address));
    await (await as(greenLedger.address, ownerWallet)).write.retireCertificate([1n]);
    await viem.assertions.revertWith(
      greenLedger.write.revokeCertificate([1n, "late"]),
      "Cannot revoke retired certificate",
    );
  });

  it("should record issuance details in the event log for the audit trail", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    await greenLedger.write.issueCertificate(issueArgs("R-1"));
    const events = await greenLedger.getEvents.CertificateIssued();
    assert.equal(events.length, 1);
    assert.equal(events[0].args.energyMWh, 1n);
    assert.equal(events[0].args.generationRecordId, "R-1");
  });

  it("should store a fingerprint that matches only the exact issued details", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    await greenLedger.write.issueCertificate(issueArgs("R-1"));
    const stored = (await greenLedger.read.getCertificate([1n])).fingerprint;
    const same = await greenLedger.read.computeFingerprint(["Hambantota Solar Farm", "Solar", 1n, "2026-09", "R-1"]);
    const changed = await greenLedger.read.computeFingerprint(["Hambantota Solar Farm", "Solar", 2n, "2026-09", "R-1"]);
    assert.equal(stored, same);
    assert.notEqual(stored, changed);
    assert.equal(await greenLedger.read.verifyFingerprint([1n, same]), true);
    assert.equal(await greenLedger.read.verifyFingerprint([1n, changed]), false);
    await viem.assertions.revertWith(
      greenLedger.read.verifyFingerprint([99n, same]),
      "Certificate does not exist",
    );
  });

  it("should match the fingerprint the frontend computes with viem", async function () {
    const greenLedger = await viem.deployContract("GreenLedger");
    await greenLedger.write.issueCertificate(issueArgs("R-1"));
    const offChain = keccak256(encodeAbiParameters(
      [{ type: "string" }, { type: "string" }, { type: "uint256" }, { type: "string" }, { type: "string" }],
      ["Hambantota Solar Farm", "Solar", 1n, "2026-09", "R-1"],
    ));
    assert.equal((await greenLedger.read.getCertificate([1n])).fingerprint, offChain);
  });
});
