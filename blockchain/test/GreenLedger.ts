import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { encodeAbiParameters, keccak256 } from "viem";

const ZERO32 = `0x${"0".repeat(64)}` as const;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
const SOLAR = "Hambantota Solar Farm";

describe("GreenLedger", async function () {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  // Wallets: 0 issuer, 1 owner, 2 recipient, 3 stranger, 4 generator, 5 second generator.
  async function setup() {
    const greenLedger = await viem.deployContract("GreenLedger");
    const wallets = await viem.getWalletClients();
    const [issuer, owner, recipient, stranger, generator, generator2] = wallets;
    await greenLedger.write.registerGenerator([SOLAR, generator.account.address]);
    const as = (wallet: (typeof wallets)[number]) =>
      viem.getContractAt("GreenLedger", greenLedger.address, { client: { wallet } });

    // Signs the EIP-712 GenerationRecord as the given wallet (default: the generator).
    async function sign(
      o: { generatorId?: bigint; source?: string; mwh?: bigint; period: string; record: string; previous?: `0x${string}`; signer?: (typeof wallets)[number] },
    ) {
      const generatorId = o.generatorId ?? 1n;
      const previous = o.previous ?? (await greenLedger.read.latestGeneratorFingerprint([generatorId]));
      return (o.signer ?? generator).signTypedData({
        domain: { name: "GreenLedger", version: "1", chainId, verifyingContract: greenLedger.address },
        types: {
          GenerationRecord: [
            { name: "generatorId", type: "uint256" },
            { name: "energySource", type: "string" },
            { name: "energyMWh", type: "uint256" },
            { name: "generationPeriod", type: "string" },
            { name: "generationRecordId", type: "string" },
            { name: "previousFingerprint", type: "bytes32" },
          ],
        },
        primaryType: "GenerationRecord",
        message: {
          generatorId,
          energySource: o.source ?? "Solar",
          energyMWh: o.mwh ?? 1n,
          generationPeriod: o.period,
          generationRecordId: o.record,
          previousFingerprint: previous,
        },
      });
    }

    // Signs (as the generator) and issues (as the issuer).
    async function issue(record = "R-1", period = "2026-09", to = owner.account.address, generatorId = 1n) {
      const signature = await sign({ generatorId, period, record });
      return greenLedger.write.issueCertificate([generatorId, "Solar", 1n, period, to, record, signature]);
    }
    return { greenLedger, issuer, owner, recipient, stranger, generator, generator2, as, sign, issue };
  }

  // ---------------------------------------------------------- issuing
  it("should allow the issuer to issue a signed certificate and emit details", async function () {
    const { greenLedger, owner, generator, issue } = await setup();
    await viem.assertions.emitWithArgs(issue("R-1"), greenLedger, "CertificateIssued", [
      1n, owner.account.address, SOLAR, 1n, "R-1", 1n, generator.account.address,
    ]);
  });

  it("should store certificate data correctly", async function () {
    const { greenLedger, owner, generator, issue } = await setup();
    await issue("R-1");
    const c = await greenLedger.read.getCertificate([1n]);
    assert.equal(c.id, 1n);
    assert.equal(c.generatorId, 1n);
    assert.equal(c.generatorName, SOLAR);
    assert.equal(c.energySource, "Solar");
    assert.equal(c.energyMWh, 1n);
    assert.equal(c.generationPeriod, "2026-09");
    assert.equal(c.owner.toLowerCase(), owner.account.address.toLowerCase());
    assert.equal(c.exists, true);
    assert.equal(c.retired, false);
    assert.equal(c.revoked, false);
    assert.equal(c.generationRecordId, "R-1");
    assert.equal(c.attestedBy.toLowerCase(), generator.account.address.toLowerCase());
  });

  it("should reject issuance from a non-issuer", async function () {
    const { as, stranger, sign, owner } = await setup();
    const signature = await sign({ period: "2026-09", record: "R-1" });
    await viem.assertions.revertWith(
      (await as(stranger)).write.issueCertificate([1n, "Solar", 1n, "2026-09", owner.account.address, "R-1", signature]),
      "Only issuer can call this",
    );
  });

  it("should reject duplicate, empty, zero-owner, zero-energy, unknown and inactive-generator issuance", async function () {
    const { greenLedger, owner, sign, issue } = await setup();
    await issue("R-1");
    await viem.assertions.revertWith(issue("R-1"), "Generation record already issued");
    assert.equal(await greenLedger.read.nextCertificateId(), 2n);

    const good = await sign({ period: "2026-09", record: "R-2" });
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([1n, "Solar", 1n, "2026-09", owner.account.address, "", good]),
      "Generation record ID is required",
    );
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([1n, "Solar", 1n, "2026-09", ZERO_ADDR, "R-2", good]),
      "Invalid owner address",
    );
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([1n, "Solar", 0n, "2026-09", owner.account.address, "R-2", good]),
      "Energy amount must be greater than zero",
    );
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([9n, "Solar", 1n, "2026-09", owner.account.address, "R-2", good]),
      "Generator does not exist",
    );
    await greenLedger.write.deactivateGenerator([1n]);
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([1n, "Solar", 1n, "2026-09", owner.account.address, "R-2", good]),
      "Generator is not active",
    );
  });

  it("should keep a record ID consumed after retirement, and treat IDs as case-sensitive", async function () {
    const { as, owner, issue } = await setup();
    await issue("R-1");
    await (await as(owner)).write.retireCertificate([1n]);
    await viem.assertions.revertWith(issue("R-1"), "Generation record already issued");
    await issue("r-1");
  });

  // ------------------------------------------- signatures (EIP-712)
  it("should reject a signature from anyone but the registered generator", async function () {
    const { greenLedger, owner, stranger, sign } = await setup();
    const forged = await sign({ period: "2026-09", record: "R-1", signer: stranger });
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([1n, "Solar", 1n, "2026-09", owner.account.address, "R-1", forged]),
      "Invalid generator signature",
    );
  });

  it("should reject a signature whose fields differ from the issued ones", async function () {
    const { greenLedger, owner, sign } = await setup();
    const signature = await sign({ period: "2026-09", record: "R-1", mwh: 1n });
    // Issuer tries to inflate the energy the generator attested.
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([1n, "Solar", 500n, "2026-09", owner.account.address, "R-1", signature]),
      "Invalid generator signature",
    );
  });

  it("should reject malformed and malleable signatures", async function () {
    const { greenLedger, owner, sign } = await setup();
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([1n, "Solar", 1n, "2026-09", owner.account.address, "R-1", "0x1234"]),
      "Invalid signature length",
    );
    const signature = await sign({ period: "2026-09", record: "R-1" });
    // Flip s to the high half: (n - s). It recovers the same signer but must be refused.
    const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const s = BigInt(`0x${signature.slice(66, 130)}`);
    const v = parseInt(signature.slice(130, 132), 16);
    const malleable = `${signature.slice(0, 66)}${(n - s).toString(16).padStart(64, "0")}${(v === 27 ? 28 : 27).toString(16)}` as `0x${string}`;
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([1n, "Solar", 1n, "2026-09", owner.account.address, "R-1", malleable]),
      "Invalid generator signature",
    );
    // An all-zero signature recovers no signer.
    const zero = `0x${"00".repeat(64)}1b` as `0x${string}`;
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([1n, "Solar", 1n, "2026-09", owner.account.address, "R-1", zero]),
      "Invalid generator signature",
    );
  });

  it("should not let a signature be replayed or used out of chain order", async function () {
    const { greenLedger, owner, sign, issue } = await setup();
    const first = await sign({ period: "2026-07", record: "R-1" });
    await greenLedger.write.issueCertificate([1n, "Solar", 1n, "2026-07", owner.account.address, "R-1", first]);
    // Replaying the same signed record fails (record ID consumed).
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([1n, "Solar", 1n, "2026-07", owner.account.address, "R-1", first]),
      "Generation record already issued",
    );
    // A signature made against the old chain head is invalid once the head moved.
    const stale = await sign({ period: "2026-08", record: "R-2" });
    await issue("R-9", "2026-08");
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([1n, "Solar", 1n, "2026-08", owner.account.address, "R-2", stale]),
      "Invalid generator signature",
    );
  });

  // ------------------------------------------------ generator registry
  it("should manage the generator registry", async function () {
    const { greenLedger, as, stranger, generator2 } = await setup();
    await viem.assertions.revertWith(
      (await as(stranger)).write.registerGenerator(["X", stranger.account.address]),
      "Only issuer can call this",
    );
    await viem.assertions.revertWith(greenLedger.write.registerGenerator(["", stranger.account.address]), "Generator name is required");
    await viem.assertions.revertWith(greenLedger.write.registerGenerator(["X", ZERO_ADDR]), "Invalid generator wallet");
    await viem.assertions.emitWithArgs(
      greenLedger.write.registerGenerator(["Second Farm", generator2.account.address]),
      greenLedger, "GeneratorRegistered", [2n, generator2.account.address, "Second Farm"],
    );
    assert.equal(await greenLedger.read.generatorCount(), 2n);
    assert.equal((await greenLedger.read.getGenerator([2n])).name, "Second Farm");
    await viem.assertions.revertWith(greenLedger.read.getGenerator([9n]), "Generator does not exist");

    await viem.assertions.revertWith(greenLedger.write.deactivateGenerator([9n]), "Generator does not exist");
    await viem.assertions.revertWith(
      (await as(stranger)).write.deactivateGenerator([1n]),
      "Only issuer can call this",
    );
    await greenLedger.write.deactivateGenerator([1n]);
    await viem.assertions.revertWith(greenLedger.write.deactivateGenerator([1n]), "Generator already inactive");
    assert.equal((await greenLedger.read.getGenerator([1n])).active, false);
  });

  // -------------------------------------------------- provenance chain
  it("should hash-link each generator's certificates into a separate chain", async function () {
    const { greenLedger, generator2, sign } = await setup();
    await greenLedger.write.registerGenerator(["Other Farm", generator2.account.address]);
    const owner = "0x0000000000000000000000000000000000000001";
    const put = async (id: bigint, record: string, period: string, signer?: typeof generator2) => {
      const signature = await sign({ generatorId: id, period, record, signer: signer });
      await greenLedger.write.issueCertificate([id, "Solar", 1n, period, owner, record, signature]);
    };
    await put(1n, "R-1", "2026-07");
    await put(1n, "R-2", "2026-08");
    await put(1n, "R-3", "2026-09");
    await put(2n, "O-1", "2026-09", generator2);

    const [c1, c2, c3, other] = await Promise.all([1n, 2n, 3n, 4n].map((id) => greenLedger.read.getCertificate([id])));
    assert.equal(c1.previousFingerprint, ZERO32);
    assert.equal(c2.previousFingerprint, c1.fingerprint);
    assert.equal(c3.previousFingerprint, c2.fingerprint);
    assert.equal(other.previousFingerprint, ZERO32);
    assert.equal(await greenLedger.read.latestGeneratorFingerprint([1n]), c3.fingerprint);
    assert.equal(await greenLedger.read.generatorChainLength([1n]), 3n);
    assert.equal(await greenLedger.read.generatorChainLength([2n]), 1n);
    const detached = await greenLedger.read.computeFingerprint([1n, "Solar", 1n, "2026-09", "R-3", ZERO32]);
    assert.notEqual(detached, c3.fingerprint);
  });

  it("should keep a revoked certificate in the chain", async function () {
    const { greenLedger, issue } = await setup();
    await issue("R-1");
    await greenLedger.write.revokeCertificate([1n, "error"]);
    await issue("R-2", "2026-10");
    const c1 = await greenLedger.read.getCertificate([1n]);
    const c2 = await greenLedger.read.getCertificate([2n]);
    assert.equal(c2.previousFingerprint, c1.fingerprint);
  });

  it("should store a fingerprint that matches only the exact issued details, and match viem", async function () {
    const { greenLedger, issue } = await setup();
    await issue("R-1");
    const stored = (await greenLedger.read.getCertificate([1n])).fingerprint;
    const offChain = keccak256(encodeAbiParameters(
      [{ type: "uint256" }, { type: "string" }, { type: "uint256" }, { type: "string" }, { type: "string" }, { type: "bytes32" }],
      [1n, "Solar", 1n, "2026-09", "R-1", ZERO32],
    ));
    const changed = await greenLedger.read.computeFingerprint([1n, "Solar", 2n, "2026-09", "R-1", ZERO32]);
    assert.equal(stored, offChain);
    assert.notEqual(stored, changed);
    assert.equal(await greenLedger.read.verifyFingerprint([1n, offChain]), true);
    assert.equal(await greenLedger.read.verifyFingerprint([1n, changed]), false);
    await viem.assertions.revertWith(greenLedger.read.verifyFingerprint([99n, offChain]), "Certificate does not exist");
  });

  // ------------------------------------------------------- lifecycle
  it("should allow the owner to transfer and enforce transfer rules", async function () {
    const { greenLedger, as, owner, recipient, stranger, issue } = await setup();
    await issue("R-1");
    await viem.assertions.revertWith(
      (await as(stranger)).write.transferCertificate([1n, recipient.account.address]),
      "Only owner can transfer",
    );
    await viem.assertions.revertWith(
      (await as(owner)).write.transferCertificate([1n, ZERO_ADDR]),
      "Invalid new owner address",
    );
    await viem.assertions.revertWith(
      (await as(owner)).write.transferCertificate([99n, recipient.account.address]),
      "Certificate does not exist",
    );
    await viem.assertions.emitWithArgs(
      (await as(owner)).write.transferCertificate([1n, recipient.account.address]),
      greenLedger, "CertificateTransferred", [1n, owner.account.address, recipient.account.address],
    );
    assert.equal(
      (await greenLedger.read.getCertificate([1n])).owner.toLowerCase(),
      recipient.account.address.toLowerCase(),
    );
  });

  it("should allow the owner to retire once, and block transfer afterwards", async function () {
    const { greenLedger, as, owner, recipient, stranger, issue } = await setup();
    await issue("R-1");
    await viem.assertions.revertWith((await as(stranger)).write.retireCertificate([1n]), "Only owner can retire");
    await viem.assertions.emitWithArgs(
      (await as(owner)).write.retireCertificate([1n]), greenLedger, "CertificateRetired", [1n, owner.account.address],
    );
    await viem.assertions.revertWith((await as(owner)).write.retireCertificate([1n]), "Certificate already retired");
    await viem.assertions.revertWith(
      (await as(owner)).write.transferCertificate([1n, recipient.account.address]),
      "Cannot transfer retired certificate",
    );
    await viem.assertions.revertWith(greenLedger.write.revokeCertificate([1n, "late"]), "Cannot revoke retired certificate");
  });

  it("should let the issuer revoke, and block transfer and retire afterwards", async function () {
    const { greenLedger, as, owner, recipient, issuer, issue } = await setup();
    await issue("R-1");
    await viem.assertions.revertWith((await as(owner)).write.revokeCertificate([1n, "x"]), "Only issuer can call this");
    await viem.assertions.revertWith(greenLedger.write.revokeCertificate([99n, "x"]), "Certificate does not exist");
    await viem.assertions.emitWithArgs(
      greenLedger.write.revokeCertificate([1n, "Meter error"]),
      greenLedger, "CertificateRevoked", [1n, issuer.account.address, "Meter error"],
    );
    assert.equal((await greenLedger.read.getCertificate([1n])).revoked, true);
    await viem.assertions.revertWith(greenLedger.write.revokeCertificate([1n, "again"]), "Certificate already revoked");
    await viem.assertions.revertWith((await as(owner)).write.transferCertificate([1n, recipient.account.address]), "Certificate revoked");
    await viem.assertions.revertWith((await as(owner)).write.retireCertificate([1n]), "Certificate revoked");
    await viem.assertions.revertWith(issue("R-1"), "Generation record already issued");
  });

  // ----------------------------------------------------------- pause
  it("should pause and unpause the registry (circuit breaker)", async function () {
    const { greenLedger, as, owner, recipient, stranger, issue } = await setup();
    await issue("R-1");
    await viem.assertions.revertWith((await as(stranger)).write.pause(), "Only issuer can call this");
    await viem.assertions.revertWith(greenLedger.write.unpause(), "Not paused");
    await viem.assertions.emitWithArgs(greenLedger.write.pause(), greenLedger, "Paused", [(await viem.getWalletClients())[0].account.address]);
    await viem.assertions.revertWith(greenLedger.write.pause(), "Already paused");
    assert.equal(await greenLedger.read.paused(), true);

    await viem.assertions.revertWith(issue("R-2"), "Registry is paused");
    await viem.assertions.revertWith((await as(owner)).write.transferCertificate([1n, recipient.account.address]), "Registry is paused");
    await viem.assertions.revertWith((await as(owner)).write.retireCertificate([1n]), "Registry is paused");
    // The issuer can still revoke during an incident.
    await greenLedger.write.revokeCertificate([1n, "incident"]);

    await viem.assertions.revertWith((await as(stranger)).write.unpause(), "Only issuer can call this");
    await viem.assertions.emitWithArgs(greenLedger.write.unpause(), greenLedger, "Unpaused", [(await viem.getWalletClients())[0].account.address]);
    await issue("R-2");
  });

  // ------------------------------------------------- issuer rotation
  it("should rotate the issuer in two steps", async function () {
    const { greenLedger, as, issuer, recipient, stranger, generator, sign } = await setup();
    const next = recipient.account.address;
    await viem.assertions.revertWith(greenLedger.write.transferIssuer([ZERO_ADDR]), "Invalid issuer address");
    await viem.assertions.revertWith((await as(stranger)).write.transferIssuer([next]), "Only issuer can call this");
    await viem.assertions.emitWithArgs(
      greenLedger.write.transferIssuer([next]), greenLedger, "IssuerTransferStarted", [issuer.account.address, next],
    );
    assert.equal((await greenLedger.read.issuer()).toLowerCase(), issuer.account.address.toLowerCase());
    await viem.assertions.revertWith((await as(stranger)).write.acceptIssuer(), "Only pending issuer can accept");
    await viem.assertions.emitWithArgs(
      (await as(recipient)).write.acceptIssuer(), greenLedger, "IssuerTransferred", [issuer.account.address, next],
    );
    assert.equal((await greenLedger.read.issuer()).toLowerCase(), next.toLowerCase());
    const signature = await sign({ period: "2026-09", record: "R-1" });
    await viem.assertions.revertWith(
      greenLedger.write.issueCertificate([1n, "Solar", 1n, "2026-09", generator.account.address, "R-1", signature]),
      "Only issuer can call this",
    );
    await (await as(recipient)).write.issueCertificate([1n, "Solar", 1n, "2026-09", generator.account.address, "R-1", signature]);
  });

  it("should expose issuance details in the event log for the audit trail", async function () {
    const { greenLedger, issue } = await setup();
    await issue("R-1");
    const events = await greenLedger.getEvents.CertificateIssued();
    assert.equal(events.length, 1);
    assert.equal(events[0].args.energyMWh, 1n);
    assert.equal(events[0].args.generationRecordId, "R-1");
    assert.equal(events[0].args.generatorId, 1n);
  });
});
