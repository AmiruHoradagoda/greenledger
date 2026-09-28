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
    }

    mapping(uint256 => Certificate) public certificates;

    event CertificateIssued(
        uint256 indexed certificateId,
        address indexed owner,
        string generatorName
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
            "Only issuer can issue certificates"
        );

        _;
    }

    function issueCertificate(
        string memory generatorName,
        string memory energySource,
        uint256 energyMWh,
        string memory generationPeriod,
        address owner
    )
        public
        onlyIssuer
        returns (uint256)
    {
        require(
            owner != address(0),
            "Invalid owner address"
        );

        require(
            energyMWh > 0,
            "Energy amount must be greater than zero"
        );

        uint256 certificateId = nextCertificateId;

        certificates[certificateId] = Certificate({
            id: certificateId,
            generatorName: generatorName,
            energySource: energySource,
            energyMWh: energyMWh,
            generationPeriod: generationPeriod,
            owner: owner,
            exists: true,
            retired: false
        });

        nextCertificateId++;

        emit CertificateIssued(
            certificateId,
            owner,
            generatorName
        );

        return certificateId;
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

    certificate.retired = true;

    emit CertificateRetired(certificateId, msg.sender);
}
}
