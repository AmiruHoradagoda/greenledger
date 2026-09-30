// Generated from the compiled GreenLedger artifact. Run npm run sync-abi after compiling.
export const greenLedgerAbi = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "certificateId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "generatorName",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "energyMWh",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "generationRecordId",
        "type": "string"
      }
    ],
    "name": "CertificateIssued",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "certificateId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "CertificateRetired",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "certificateId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "revokedBy",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "reason",
        "type": "string"
      }
    ],
    "name": "CertificateRevoked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "certificateId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "CertificateTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "currentIssuer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "pendingIssuer",
        "type": "address"
      }
    ],
    "name": "IssuerTransferStarted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousIssuer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newIssuer",
        "type": "address"
      }
    ],
    "name": "IssuerTransferred",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "acceptIssuer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "certificates",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "generatorName",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "energySource",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "energyMWh",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "generationPeriod",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "retired",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "generationRecordId",
        "type": "string"
      },
      {
        "internalType": "bool",
        "name": "revoked",
        "type": "bool"
      },
      {
        "internalType": "bytes32",
        "name": "fingerprint",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "generatorName",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "energySource",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "energyMWh",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "generationPeriod",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "generationRecordId",
        "type": "string"
      }
    ],
    "name": "computeFingerprint",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "certificateId",
        "type": "uint256"
      }
    ],
    "name": "getCertificate",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "generatorName",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "energySource",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "energyMWh",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "generationPeriod",
            "type": "string"
          },
          {
            "internalType": "address",
            "name": "owner",
            "type": "address"
          },
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "retired",
            "type": "bool"
          },
          {
            "internalType": "string",
            "name": "generationRecordId",
            "type": "string"
          },
          {
            "internalType": "bool",
            "name": "revoked",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "fingerprint",
            "type": "bytes32"
          }
        ],
        "internalType": "struct GreenLedger.Certificate",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "generatorName",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "energySource",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "energyMWh",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "generationPeriod",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "generationRecordId",
        "type": "string"
      }
    ],
    "name": "issueCertificate",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "issuer",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextCertificateId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pendingIssuer",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "certificateId",
        "type": "uint256"
      }
    ],
    "name": "retireCertificate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "certificateId",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "reason",
        "type": "string"
      }
    ],
    "name": "revokeCertificate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "certificateId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferCertificate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newIssuer",
        "type": "address"
      }
    ],
    "name": "transferIssuer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "certificateId",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "fingerprint",
        "type": "bytes32"
      }
    ],
    "name": "verifyFingerprint",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const
