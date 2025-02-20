// abis.ts
/**
 * Minimal ABIs relevant to the flow:
 * 1) ENS Controller (for registering .eth names)
 * 2) Registry & Resolver (if you want to query or set records)
 */

export const ENS_REGISTRY_ABI = [
  // If you need registry lookups beyond wagmi's built-in hooks
  // For example: function owner(bytes32 node) external view returns (address);
] as const;

export const ENS_RESOLVER_ABI = [
  // If you need to read or set addresses/text records, e.g.:
  // function addr(bytes32 node) external view returns (address);
  // function text(bytes32 node, string calldata key) external view returns (string memory);
] as const;

export const ENS_CONTROLLER_ABI = [
  {
    name: "available",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "rentPrice",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "duration", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "makeCommitment",
    type: "function",
    stateMutability: "pure",
    inputs: [
      { name: "name", type: "string" },
      { name: "owner", type: "address" },
      { name: "duration", type: "uint256" },
      { name: "secret", type: "bytes32" },
      { name: "resolver", type: "address" },
      { name: "data", type: "bytes[]" },
      { name: "reverseRecord", type: "bool" },
      { name: "ownerControlledFuses", type: "uint16" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "commit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "register",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "owner", type: "address" },
      { name: "duration", type: "uint256" },
      { name: "secret", type: "bytes32" },
      { name: "resolver", type: "address" },
      { name: "data", type: "bytes[]" },
      { name: "reverseRecord", type: "bool" },
      { name: "ownerControlledFuses", type: "uint16" },
    ],
    outputs: [],
  },
  {
    name: "minCommitmentAge",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "maxCommitmentAge",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Custom errors from the contract:
  { type: "error", name: "CommitmentTooNew", inputs: [] },
  { type: "error", name: "CommitmentTooOld", inputs: [] },
  { type: "error", name: "InsufficientValue", inputs: [] },
  { type: "error", name: "NameNotAvailable", inputs: [] },
  { type: "error", name: "DurationTooShort", inputs: [] },
  {
    type: "error",
    name: "ResolverRequiredWhenDataSupplied",
    inputs: [],
  },
  {
    type: "error",
    name: "UnexpiredCommitmentExists",
    inputs: [{ type: "bytes32", name: "commitment" }],
  },
] as const;
