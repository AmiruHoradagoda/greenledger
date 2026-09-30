// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract GreenLedger {

    // Address allowed to issue renewable energy certificates.
    address public issuer;

    // The next certificate will start with ID 1.
    uint256 public nextCertificateId = 1;

    struct Certificate {
        uint256 id;
        string generatorName;
        string energySource;
        uint256 energyMWh;
        string generationPeriod;
        address owner;
        bool exists;
        bool retired;
        string generationRecordId;
        bool revoked;
        // keccak256 of the immutable certificate details plus previousFingerprint
        // (see computeFingerprint).
        bytes32 fingerprint;
        // Fingerprint of the generator's previous certificate (0x0 for its first).
        // Links each generator's certificates into a tamper-evident chain.
        bytes32 previousFingerprint;
    }

    mapping(uint256 => Certificate) public certificates;
    mapping(string => bool) private issuedGenerationRecords;

    // Head of each generator's certificate chain and its length.
    mapping(string => bytes32) public latestGeneratorFingerprint;
    mapping(string => uint256) public generatorChainLength;

    // Proposed new issuer. Takes effect only when that address accepts.
    address public pendingIssuer;

    event CertificateIssued(
        uint256 indexed certificateId,
        address indexed owner,
        string generatorName,
        uint256 energyMWh,
        string generationRecordId
    );

    event CertificateRevoked(
        uint256 indexed certificateId,
        address indexed revokedBy,
        string reason
    );

    event IssuerTransferStarted(
        address indexed currentIssuer,
        address indexed pendingIssuer
    );

    event IssuerTransferred(
        address indexed previousIssuer,
        address indexed newIssuer
    );

    event CertificateRetired(
    uint256 indexed certificateId,
    address indexed owner
    );


    constructor() {
        issuer = msg.sender;
    }

    modifier onlyIssuer() {
        require(
            msg.sender == issuer,
            "Only issuer can call this"
        );

        _;
    }

    function issueCertificate(
        string memory generatorName,
        string memory energySource,
        uint256 energyMWh,
        string memory generationPeriod,
        address owner,
        string memory generationRecordId
    )
        public
        onlyIssuer
        returns (uint256)
    {
        require(bytes(generationRecordId).length > 0, "Generation record ID is required");
        require(!issuedGenerationRecords[generationRecordId], "Generation record already issued");

        require(
            owner != address(0),
            "Invalid owner address"
        );

        require(
            energyMWh > 0,
            "Energy amount must be greater than zero"
        );

        uint256 certificateId = nextCertificateId;
        bytes32 previousFingerprint = latestGeneratorFingerprint[generatorName];
        bytes32 fingerprint = computeFingerprint(
            generatorName,
            energySource,
            energyMWh,
            generationPeriod,
            generationRecordId,
            previousFingerprint
        );

        certificates[certificateId] = Certificate({
            id: certificateId,
            generatorName: generatorName,
            energySource: energySource,
            energyMWh: energyMWh,
            generationPeriod: generationPeriod,
            owner: owner,
            exists: true,
            retired: false,
            generationRecordId: generationRecordId,
            revoked: false,
            fingerprint: fingerprint,
            previousFingerprint: previousFingerprint
        });

        latestGeneratorFingerprint[generatorName] = fingerprint;
        generatorChainLength[generatorName]++;

        issuedGenerationRecords[generationRecordId] = true;
        nextCertificateId++;

        emit CertificateIssued(
            certificateId,
            owner,
            generatorName,
            energyMWh,
            generationRecordId
        );

        return certificateId;
    }

    // Hash of the details that identify the energy claim, chained to the
    // generator's previous certificate. Changing any earlier certificate
    // changes every later fingerprint. The owner is excluded because it
    // changes on transfer. Anyone can recompute this
    // off-chain and compare it with the stored value to check a claimed
    // certificate.
    function computeFingerprint(
        string memory generatorName,
        string memory energySource,
        uint256 energyMWh,
        string memory generationPeriod,
        string memory generationRecordId,
        bytes32 previousFingerprint
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                generatorName,
                energySource,
                energyMWh,
                generationPeriod,
                generationRecordId,
                previousFingerprint
            )
        );
    }

    // True when the supplied hash equals the fingerprint stored at issuance.
    function verifyFingerprint(
        uint256 certificateId,
        bytes32 fingerprint
    ) public view returns (bool) {
        require(certificates[certificateId].exists, "Certificate does not exist");
        return certificates[certificateId].fingerprint == fingerprint;
    }

    // Step 1 of issuer rotation: the current issuer nominates a successor.
    function transferIssuer(address newIssuer) public onlyIssuer {
        require(newIssuer != address(0), "Invalid issuer address");
        pendingIssuer = newIssuer;
        emit IssuerTransferStarted(issuer, newIssuer);
    }

    // Step 2: the nominee accepts, proving it controls the address.
    function acceptIssuer() public {
        require(msg.sender == pendingIssuer, "Only pending issuer can accept");
        address previousIssuer = issuer;
        issuer = msg.sender;
        pendingIssuer = address(0);
        emit IssuerTransferred(previousIssuer, msg.sender);
    }

    // Issuer can invalidate a certificate issued in error. Retired
    // certificates are final and cannot be revoked.
    function revokeCertificate(
        uint256 certificateId,
        string memory reason
    ) public onlyIssuer {
        Certificate storage certificate = certificates[certificateId];

        require(certificate.exists, "Certificate does not exist");
        require(!certificate.retired, "Cannot revoke retired certificate");
        require(!certificate.revoked, "Certificate already revoked");

        certificate.revoked = true;

        emit CertificateRevoked(certificateId, msg.sender, reason);
    }

    function getCertificate(
        uint256 certificateId
    )
        public
        view
        returns (Certificate memory)
    {
        require(
            certificates[certificateId].exists,
            "Certificate does not exist"
        );

        return certificates[certificateId];
    }
    event CertificateTransferred(
    uint256 indexed certificateId,
    address indexed from,
    address indexed to
);

function transferCertificate(uint256 certificateId, address newOwner) public {
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

function retireCertificate(uint256 certificateId) public {
    Certificate storage certificate = certificates[certificateId];

    require(certificate.exists, "Certificate does not exist");
    require(msg.sender == certificate.owner, "Only owner can retire");
    require(!certificate.retired, "Certificate already retired");
    require(!certificate.revoked, "Certificate revoked");

    certificate.retired = true;

    emit CertificateRetired(certificateId, msg.sender);
}
}
