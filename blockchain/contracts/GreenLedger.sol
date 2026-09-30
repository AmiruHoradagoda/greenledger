// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title GreenLedger
/// @notice Renewable energy certificates with a hash-linked provenance chain
/// per generator, generator-signed (EIP-712) attestations, and an emergency
/// pause. Issuing needs two independent parties: the registry issuer sends the
/// transaction, and the registered generator wallet must have signed the
/// generation record.
contract GreenLedger {
    // ---------------------------------------------------------------- roles
    address public issuer;
    address public pendingIssuer;
    bool public paused;

    // ------------------------------------------------------------ registry
    struct Generator {
        string name;
        address wallet; // account that must sign this generator's records
        bool active;
    }

    uint256 public generatorCount;
    mapping(uint256 => Generator) private _generators;

    // Head and length of each generator's certificate chain.
    mapping(uint256 => bytes32) public latestGeneratorFingerprint;
    mapping(uint256 => uint256) public generatorChainLength;

    // -------------------------------------------------------- certificates
    struct Certificate {
        uint256 id;
        uint256 generatorId;
        string generatorName;
        string energySource;
        uint256 energyMWh;
        string generationPeriod;
        address owner;
        bool exists;
        bool retired;
        bool revoked;
        string generationRecordId;
        // keccak256 of the details plus previousFingerprint (computeFingerprint).
        bytes32 fingerprint;
        // Fingerprint of the generator's previous certificate (0x0 for its first).
        bytes32 previousFingerprint;
        // Generator wallet whose EIP-712 signature authorised this issuance.
        address attestedBy;
    }

    uint256 public nextCertificateId = 1;
    mapping(uint256 => Certificate) public certificates;
    mapping(string => bool) private issuedGenerationRecords;

    // -------------------------------------------------------------- EIP-712
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant RECORD_TYPEHASH = keccak256(
        "GenerationRecord(uint256 generatorId,string energySource,uint256 energyMWh,string generationPeriod,string generationRecordId,bytes32 previousFingerprint)"
    );
    // Upper bound of the lower half of the secp256k1 order (rejects malleable signatures).
    uint256 private constant HALF_ORDER =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    // --------------------------------------------------------------- events
    event GeneratorRegistered(uint256 indexed generatorId, address indexed wallet, string name);
    event GeneratorDeactivated(uint256 indexed generatorId);
    event CertificateIssued(
        uint256 indexed certificateId,
        address indexed owner,
        string generatorName,
        uint256 energyMWh,
        string generationRecordId,
        uint256 generatorId,
        address attestedBy
    );
    event CertificateTransferred(uint256 indexed certificateId, address indexed from, address indexed to);
    event CertificateRetired(uint256 indexed certificateId, address indexed owner);
    event CertificateRevoked(uint256 indexed certificateId, address indexed revokedBy, string reason);
    event IssuerTransferStarted(address indexed currentIssuer, address indexed pendingIssuer);
    event IssuerTransferred(address indexed previousIssuer, address indexed newIssuer);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    constructor() {
        issuer = msg.sender;
    }

    modifier onlyIssuer() {
        require(msg.sender == issuer, "Only issuer can call this");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Registry is paused");
        _;
    }

    // ------------------------------------------------------ issuer / pause
    function transferIssuer(address newIssuer) public onlyIssuer {
        require(newIssuer != address(0), "Invalid issuer address");
        pendingIssuer = newIssuer;
        emit IssuerTransferStarted(issuer, newIssuer);
    }

    function acceptIssuer() public {
        require(msg.sender == pendingIssuer, "Only pending issuer can accept");
        address previousIssuer = issuer;
        issuer = msg.sender;
        pendingIssuer = address(0);
        emit IssuerTransferred(previousIssuer, msg.sender);
    }

    /// @notice Emergency stop: blocks issuing, transfers and retirement.
    function pause() public onlyIssuer {
        require(!paused, "Already paused");
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() public onlyIssuer {
        require(paused, "Not paused");
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ------------------------------------------------------------ registry
    function registerGenerator(string memory name, address wallet) public onlyIssuer returns (uint256) {
        require(bytes(name).length > 0, "Generator name is required");
        require(wallet != address(0), "Invalid generator wallet");
        uint256 generatorId = ++generatorCount;
        _generators[generatorId] = Generator({name: name, wallet: wallet, active: true});
        emit GeneratorRegistered(generatorId, wallet, name);
        return generatorId;
    }

    /// @notice Stops new issuance for a generator. Its existing chain stays valid.
    function deactivateGenerator(uint256 generatorId) public onlyIssuer {
        require(_generators[generatorId].wallet != address(0), "Generator does not exist");
        require(_generators[generatorId].active, "Generator already inactive");
        _generators[generatorId].active = false;
        emit GeneratorDeactivated(generatorId);
    }

    function getGenerator(uint256 generatorId) public view returns (Generator memory) {
        require(_generators[generatorId].wallet != address(0), "Generator does not exist");
        return _generators[generatorId];
    }

    // ------------------------------------------------------------- issuing
    /// @param signature 65-byte EIP-712 signature by the generator's wallet over
    /// GenerationRecord(generatorId, energySource, energyMWh, generationPeriod,
    /// generationRecordId, previousFingerprint).
    function issueCertificate(
        uint256 generatorId,
        string memory energySource,
        uint256 energyMWh,
        string memory generationPeriod,
        address owner,
        string memory generationRecordId,
        bytes memory signature
    ) public onlyIssuer whenNotPaused returns (uint256) {
        require(bytes(generationRecordId).length > 0, "Generation record ID is required");
        require(!issuedGenerationRecords[generationRecordId], "Generation record already issued");
        require(owner != address(0), "Invalid owner address");
        require(energyMWh > 0, "Energy amount must be greater than zero");
        require(_generators[generatorId].wallet != address(0), "Generator does not exist");
        require(_generators[generatorId].active, "Generator is not active");

        bytes32 previous = latestGeneratorFingerprint[generatorId];
        address signer = _recoverSigner(
            generatorId, energySource, energyMWh, generationPeriod, generationRecordId, previous, signature
        );
        require(signer == _generators[generatorId].wallet, "Invalid generator signature");

        uint256 certificateId = nextCertificateId++;
        Certificate storage c = certificates[certificateId];
        c.id = certificateId;
        c.generatorId = generatorId;
        c.generatorName = _generators[generatorId].name;
        c.energySource = energySource;
        c.energyMWh = energyMWh;
        c.generationPeriod = generationPeriod;
        c.owner = owner;
        c.exists = true;
        c.generationRecordId = generationRecordId;
        c.previousFingerprint = previous;
        c.attestedBy = signer;
        c.fingerprint = computeFingerprint(
            generatorId, energySource, energyMWh, generationPeriod, generationRecordId, previous
        );

        issuedGenerationRecords[generationRecordId] = true;
        latestGeneratorFingerprint[generatorId] = c.fingerprint;
        generatorChainLength[generatorId]++;

        emit CertificateIssued(
            certificateId, owner, c.generatorName, energyMWh, generationRecordId, generatorId, signer
        );
        return certificateId;
    }

    /// @notice Hash of the claim, chained to the generator's previous certificate.
    /// The owner is excluded because it changes on transfer.
    function computeFingerprint(
        uint256 generatorId,
        string memory energySource,
        uint256 energyMWh,
        string memory generationPeriod,
        string memory generationRecordId,
        bytes32 previousFingerprint
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(generatorId, energySource, energyMWh, generationPeriod, generationRecordId, previousFingerprint)
        );
    }

    /// @notice The EIP-712 digest a generator must sign for the given record.
    function recordDigest(
        uint256 generatorId,
        string memory energySource,
        uint256 energyMWh,
        string memory generationPeriod,
        string memory generationRecordId,
        bytes32 previousFingerprint
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                RECORD_TYPEHASH,
                generatorId,
                keccak256(bytes(energySource)),
                energyMWh,
                keccak256(bytes(generationPeriod)),
                keccak256(bytes(generationRecordId)),
                previousFingerprint
            )
        );
        bytes32 domain = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("GreenLedger"), keccak256("1"), block.chainid, address(this))
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _recoverSigner(
        uint256 generatorId,
        string memory energySource,
        uint256 energyMWh,
        string memory generationPeriod,
        string memory generationRecordId,
        bytes32 previous,
        bytes memory signature
    ) private view returns (address) {
        require(signature.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        require(uint256(s) <= HALF_ORDER && (v == 27 || v == 28), "Invalid generator signature");
        address signer = ecrecover(
            recordDigest(generatorId, energySource, energyMWh, generationPeriod, generationRecordId, previous),
            v, r, s
        );
        require(signer != address(0), "Invalid generator signature");
        return signer;
    }

    // ---------------------------------------------------------- lifecycle
    function getCertificate(uint256 certificateId) public view returns (Certificate memory) {
        require(certificates[certificateId].exists, "Certificate does not exist");
        return certificates[certificateId];
    }

    /// @notice True when the supplied hash equals the fingerprint stored at issuance.
    function verifyFingerprint(uint256 certificateId, bytes32 fingerprint) public view returns (bool) {
        require(certificates[certificateId].exists, "Certificate does not exist");
        return certificates[certificateId].fingerprint == fingerprint;
    }

    function transferCertificate(uint256 certificateId, address newOwner) public whenNotPaused {
        Certificate storage certificate = certificates[certificateId];

        require(certificate.exists, "Certificate does not exist");
        require(msg.sender == certificate.owner, "Only owner can transfer");
        require(!certificate.retired, "Cannot transfer retired certificate");
        require(!certificate.revoked, "Certificate revoked");
        require(newOwner != address(0), "Invalid new owner address");

        address previousOwner = certificate.owner;
        certificate.owner = newOwner;

        emit CertificateTransferred(certificateId, previousOwner, newOwner);
    }

    function retireCertificate(uint256 certificateId) public whenNotPaused {
        Certificate storage certificate = certificates[certificateId];

        require(certificate.exists, "Certificate does not exist");
        require(msg.sender == certificate.owner, "Only owner can retire");
        require(!certificate.retired, "Certificate already retired");
        require(!certificate.revoked, "Certificate revoked");

        certificate.retired = true;

        emit CertificateRetired(certificateId, msg.sender);
    }

    /// @notice Invalidates a certificate issued in error. Retired ones are final.
    /// Works while paused so the issuer can respond to an incident.
    function revokeCertificate(uint256 certificateId, string memory reason) public onlyIssuer {
        Certificate storage certificate = certificates[certificateId];

        require(certificate.exists, "Certificate does not exist");
        require(!certificate.retired, "Cannot revoke retired certificate");
        require(!certificate.revoked, "Certificate already revoked");

        certificate.revoked = true;

        emit CertificateRevoked(certificateId, msg.sender, reason);
    }
}
