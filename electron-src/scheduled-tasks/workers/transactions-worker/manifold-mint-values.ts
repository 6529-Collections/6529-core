import { ethers } from "ethers";
import type { Transaction } from "../../../db/entities/ITransaction";

export const MANIFOLD_LAZY_CLAIM_CONTRACT =
  "0x26bbea7803dcac346d5f5f135b57cf2c752a02be";

const ENTRY_POINT_V6_IFACE = new ethers.Interface([
  "function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)[] ops,address payable beneficiary)"
]);

const ENTRY_POINT_V7_IFACE = new ethers.Interface([
  "function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops,address payable beneficiary)"
]);

const SMART_ACCOUNT_IFACE = new ethers.Interface([
  "function execute(address target,uint256 value,bytes data)",
  "function executeBatch((address target,uint256 value,bytes data)[] calls)"
]);

const MANIFOLD_CLAIM_IFACE = new ethers.Interface([
  "function MINT_FEE() view returns (uint256)",
  "function MINT_FEE_MERKLE() view returns (uint256)",
  "function getClaim(address creatorContractAddress,uint256 instanceId) view returns ((uint32 total,uint32 totalMax,uint32 walletMax,uint48 startDate,uint48 endDate,uint8 storageProtocol,bytes32 merkleRoot,string location,uint256 tokenId,uint256 cost,address paymentReceiver,address erc20,address signingAddress) claim)",
  "function mint(address creatorContractAddress,uint256 instanceId,uint32 mintIndex,bytes32[] merkleProof,address mintFor) payable",
  "function mintBatch(address creatorContractAddress,uint256 instanceId,uint16 mintCount,uint32[] mintIndices,bytes32[][] merkleProofs,address mintFor) payable",
  "function mintProxy(address creatorContractAddress,uint256 instanceId,uint16 mintCount,uint32[] mintIndices,bytes32[][] merkleProofs,address mintFor) payable",
  "function mintSignature(address creatorContractAddress,uint256 instanceId,uint16 mintCount,bytes signature,bytes32 message,bytes32 nonce,address mintFor,uint256 expiration) payable"
]);

type ExecutableCall = {
  target: string;
  valueWei: bigint;
  data: string;
};

type ManifoldMintPayment = {
  creatorContract: string;
  instanceId: bigint;
  mintCount: bigint;
  mintFor: string;
  grossValueWei: bigint;
};

export type ManifoldClaimPricing = {
  tokenId: bigint;
  costWei: bigint;
  erc20: string;
  publicFeeWei: bigint;
  merkleFeeWei: bigint;
};

export type ManifoldClaimPricingReader = (
  creatorContract: string,
  instanceId: bigint
) => Promise<ManifoldClaimPricing>;

export type ManifoldMintValues = {
  value: number;
  primaryProceeds: number | null;
};

function addressesEqual(first: string, second: string): boolean {
  return first.toLowerCase() === second.toLowerCase();
}

function getSelector(data: string): string {
  return data.slice(0, 10).toLowerCase();
}

function decodeSmartAccountCalls(callData: string): ExecutableCall[] {
  const selector = getSelector(callData);
  const executeSelector = SMART_ACCOUNT_IFACE.getFunction("execute")!.selector;
  const executeBatchSelector =
    SMART_ACCOUNT_IFACE.getFunction("executeBatch")!.selector;

  try {
    if (selector === executeSelector) {
      const [target, value, data] = SMART_ACCOUNT_IFACE.decodeFunctionData(
        "execute",
        callData
      );
      return [
        {
          target: String(target),
          valueWei: BigInt(value),
          data: String(data)
        }
      ];
    }

    if (selector === executeBatchSelector) {
      const [calls] = SMART_ACCOUNT_IFACE.decodeFunctionData(
        "executeBatch",
        callData
      );
      return Array.from(calls as ethers.Result).map((call) => ({
        target: String(call.target ?? call[0]),
        valueWei: BigInt(call.value ?? call[1]),
        data: String(call.data ?? call[2])
      }));
    }
  } catch {
    return [];
  }

  return [];
}

function decodeHandleOpsCallData(
  transactionData: string,
  iface: ethers.Interface
): string[] {
  const handleOps = iface.getFunction("handleOps")!;
  if (getSelector(transactionData) !== handleOps.selector) {
    return [];
  }

  try {
    const [operations] = iface.decodeFunctionData("handleOps", transactionData);
    return Array.from(operations as ethers.Result).map((operation) =>
      String(operation.callData ?? operation[3])
    );
  } catch {
    return [];
  }
}

function getExecutableCalls(
  transaction: Pick<ethers.TransactionResponse, "to" | "data" | "value">
): ExecutableCall[] {
  const entryPointCallData = [
    ...decodeHandleOpsCallData(transaction.data, ENTRY_POINT_V6_IFACE),
    ...decodeHandleOpsCallData(transaction.data, ENTRY_POINT_V7_IFACE)
  ];

  if (entryPointCallData.length > 0) {
    return entryPointCallData.flatMap(decodeSmartAccountCalls);
  }

  if (!transaction.to) {
    return [];
  }

  return [
    {
      target: transaction.to,
      valueWei: transaction.value,
      data: transaction.data
    }
  ];
}

function decodeManifoldMintPayment(
  call: ExecutableCall
): ManifoldMintPayment | null {
  if (
    !addressesEqual(call.target, MANIFOLD_LAZY_CLAIM_CONTRACT) ||
    call.valueWei <= 0n
  ) {
    return null;
  }

  let parsed: ethers.TransactionDescription | null;
  try {
    parsed = MANIFOLD_CLAIM_IFACE.parseTransaction({
      data: call.data,
      value: call.valueWei
    });
  } catch {
    return null;
  }

  if (!parsed) {
    return null;
  }

  const creatorContract = String(parsed.args[0]);
  const instanceId = BigInt(parsed.args[1]);
  switch (parsed.name) {
    case "mint":
      return {
        creatorContract,
        instanceId,
        mintCount: 1n,
        mintFor: String(parsed.args[4]),
        grossValueWei: call.valueWei
      };
    case "mintBatch":
    case "mintProxy":
      return {
        creatorContract,
        instanceId,
        mintCount: BigInt(parsed.args[2]),
        mintFor: String(parsed.args[5]),
        grossValueWei: call.valueWei
      };
    case "mintSignature":
      return {
        creatorContract,
        instanceId,
        mintCount: BigInt(parsed.args[2]),
        mintFor: String(parsed.args[6]),
        grossValueWei: call.valueWei
      };
    default:
      return null;
  }
}

export function decodeManifoldMintPayments(
  transaction: Pick<ethers.TransactionResponse, "to" | "data" | "value">
): ManifoldMintPayment[] {
  return getExecutableCalls(transaction)
    .map(decodeManifoldMintPayment)
    .filter((payment): payment is ManifoldMintPayment => payment !== null);
}

function getVerifiedPrimaryProceedsWei(
  payment: ManifoldMintPayment,
  pricing: ManifoldClaimPricing
): bigint | null {
  if (!addressesEqual(pricing.erc20, ethers.ZeroAddress)) {
    return null;
  }

  const primaryProceedsWei = pricing.costWei * payment.mintCount;
  const matchesKnownFee = [pricing.publicFeeWei, pricing.merkleFeeWei].some(
    (feeWei) =>
      primaryProceedsWei + feeWei * payment.mintCount === payment.grossValueWei
  );

  return matchesKnownFee ? primaryProceedsWei : null;
}

export async function resolveManifoldMintValues(
  transaction: Pick<ethers.TransactionResponse, "to" | "data" | "value">,
  row: Pick<
    Transaction,
    "contract" | "token_id" | "token_count" | "to_address"
  >,
  readPricing: ManifoldClaimPricingReader
): Promise<ManifoldMintValues | null> {
  const candidatePayments = decodeManifoldMintPayments(transaction).filter(
    (payment) =>
      addressesEqual(payment.creatorContract, row.contract) &&
      addressesEqual(payment.mintFor, row.to_address)
  );

  let matchedMintCount = 0n;
  let grossValueWei = 0n;
  let primaryProceedsWei = 0n;
  let hasUnverifiedPrimaryProceeds = false;

  for (const payment of candidatePayments) {
    const pricing = await readPricing(
      payment.creatorContract,
      payment.instanceId
    );
    if (pricing.tokenId !== BigInt(row.token_id)) {
      continue;
    }

    matchedMintCount += payment.mintCount;
    grossValueWei += payment.grossValueWei;
    const verifiedPrimaryProceedsWei = getVerifiedPrimaryProceedsWei(
      payment,
      pricing
    );
    if (verifiedPrimaryProceedsWei === null) {
      hasUnverifiedPrimaryProceeds = true;
    } else {
      primaryProceedsWei += verifiedPrimaryProceedsWei;
    }
  }

  if (matchedMintCount === 0n || matchedMintCount !== BigInt(row.token_count)) {
    return null;
  }

  return {
    value: Number.parseFloat(ethers.formatEther(grossValueWei)),
    primaryProceeds: hasUnverifiedPrimaryProceeds
      ? null
      : Number.parseFloat(ethers.formatEther(primaryProceedsWei))
  };
}

export function createManifoldClaimPricingReader(
  provider: ethers.Provider
): ManifoldClaimPricingReader {
  const claims = new Map<string, Promise<ManifoldClaimPricing>>();
  let fees: Promise<{
    publicFeeWei: bigint;
    merkleFeeWei: bigint;
  }> | null = null;
  const getFees = () => {
    fees ??= Promise.all([
      provider.call({
        to: MANIFOLD_LAZY_CLAIM_CONTRACT,
        data: MANIFOLD_CLAIM_IFACE.encodeFunctionData("MINT_FEE")
      }),
      provider.call({
        to: MANIFOLD_LAZY_CLAIM_CONTRACT,
        data: MANIFOLD_CLAIM_IFACE.encodeFunctionData("MINT_FEE_MERKLE")
      })
    ]).then(([publicFeeResult, merkleFeeResult]) => ({
      publicFeeWei: BigInt(
        MANIFOLD_CLAIM_IFACE.decodeFunctionResult(
          "MINT_FEE",
          publicFeeResult
        )[0]
      ),
      merkleFeeWei: BigInt(
        MANIFOLD_CLAIM_IFACE.decodeFunctionResult(
          "MINT_FEE_MERKLE",
          merkleFeeResult
        )[0]
      )
    }));
    return fees;
  };

  return async (creatorContract, instanceId) => {
    const key = `${creatorContract.toLowerCase()}:${instanceId}`;
    let claim = claims.get(key);
    if (!claim) {
      claim = Promise.all([
        provider.call({
          to: MANIFOLD_LAZY_CLAIM_CONTRACT,
          data: MANIFOLD_CLAIM_IFACE.encodeFunctionData("getClaim", [
            creatorContract,
            instanceId
          ])
        }),
        getFees()
      ]).then(([claimResult, resolvedFees]) => {
        const decodedClaim = MANIFOLD_CLAIM_IFACE.decodeFunctionResult(
          "getClaim",
          claimResult
        )[0];
        return {
          tokenId: BigInt(decodedClaim.tokenId ?? decodedClaim[8]),
          costWei: BigInt(decodedClaim.cost ?? decodedClaim[9]),
          erc20: String(decodedClaim.erc20 ?? decodedClaim[11]),
          ...resolvedFees
        };
      });
      claims.set(key, claim);
    }
    return claim;
  };
}

export const manifoldMintValueTestInterfaces = {
  entryPointV6: ENTRY_POINT_V6_IFACE,
  smartAccount: SMART_ACCOUNT_IFACE,
  manifoldClaim: MANIFOLD_CLAIM_IFACE
};
