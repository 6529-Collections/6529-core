import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ethers } from "ethers";
import {
  MANIFOLD_LAZY_CLAIM_CONTRACT,
  manifoldMintValueTestInterfaces,
  resolveManifoldMintValues,
  type ManifoldClaimPricing
} from "./manifold-mint-values";

const ENTRY_POINT_V6 = "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789";
const MEMES_CONTRACT = "0x33fd426905f149f8376e227d0c9d3340aad17af1";
const RECIPIENT = "0xa88fe6fa01fcc112bb2164c6e37d63395b923e5f";
const BUNDLER = "0xe469ee44d92bb173b7edc576ebb09da55dbfe32e";
const PUBLIC_MINT_FEE = ethers.parseEther("0.0005");
const MERKLE_MINT_FEE = ethers.parseEther("0.00069");
const MINT_COST = ethers.parseEther("0.06529");

const { entryPointV6, smartAccount, manifoldClaim } =
  manifoldMintValueTestInterfaces;

function makeMintData(
  mintFor: string = RECIPIENT,
  instanceId: bigint = 537n
): string {
  return manifoldClaim.encodeFunctionData("mint", [
    MEMES_CONTRACT,
    instanceId,
    0,
    [],
    mintFor
  ]);
}

function makeExecuteBatchCall(
  calls: Array<{ target: string; value: bigint; data: string }>
): string {
  return smartAccount.encodeFunctionData("executeBatch", [calls]);
}

function makeHandleOpsTransaction(callData: string) {
  const operation = {
    sender: RECIPIENT,
    nonce: 30,
    initCode: "0x",
    callData,
    callGasLimit: 122_413,
    verificationGasLimit: 80_637,
    preVerificationGas: 98_376,
    maxFeePerGas: 4_371_876_625,
    maxPriorityFeePerGas: 100_000_000,
    paymasterAndData: "0x",
    signature: "0x"
  };
  return {
    to: ENTRY_POINT_V6,
    value: 0n,
    data: entryPointV6.encodeFunctionData("handleOps", [[operation], BUNDLER])
  };
}

function row(
  overrides: Partial<{
    contract: string;
    token_id: number;
    token_count: number;
    to_address: string;
  }> = {}
) {
  return {
    contract: MEMES_CONTRACT,
    token_id: 537,
    token_count: 1,
    to_address: RECIPIENT,
    ...overrides
  };
}

function pricing(
  overrides: Partial<ManifoldClaimPricing> = {}
): ManifoldClaimPricing {
  return {
    tokenId: 537n,
    costWei: MINT_COST,
    erc20: ethers.ZeroAddress,
    publicFeeWei: PUBLIC_MINT_FEE,
    merkleFeeWei: MERKLE_MINT_FEE,
    ...overrides
  };
}

describe("Manifold mint calldata values", () => {
  it("recovers the ERC-4337 public mint gross value and primary proceeds", async () => {
    const transaction = makeHandleOpsTransaction(
      makeExecuteBatchCall([
        {
          target: MANIFOLD_LAZY_CLAIM_CONTRACT,
          value: ethers.parseEther("0.06579"),
          data: makeMintData()
        }
      ])
    );

    const result = await resolveManifoldMintValues(
      transaction,
      row(),
      async () => pricing()
    );

    assert.deepEqual(result, {
      value: 0.06579,
      primaryProceeds: 0.06529
    });
  });

  it("supports a direct Manifold mint paid by a normal transaction", async () => {
    const result = await resolveManifoldMintValues(
      {
        to: MANIFOLD_LAZY_CLAIM_CONTRACT,
        value: ethers.parseEther("0.06598"),
        data: makeMintData()
      },
      row(),
      async () => pricing()
    );

    assert.deepEqual(result, {
      value: 0.06598,
      primaryProceeds: 0.06529
    });
  });

  it("aggregates matching mint calls without attributing unrelated calls", async () => {
    const transaction = makeHandleOpsTransaction(
      makeExecuteBatchCall([
        {
          target: MANIFOLD_LAZY_CLAIM_CONTRACT,
          value: ethers.parseEther("0.06579"),
          data: makeMintData()
        },
        {
          target: MANIFOLD_LAZY_CLAIM_CONTRACT,
          value: ethers.parseEther("0.06579"),
          data: makeMintData()
        },
        {
          target: "0x0000000000000000000000000000000000000001",
          value: ethers.parseEther("1"),
          data: "0x"
        }
      ])
    );

    const result = await resolveManifoldMintValues(
      transaction,
      row({ token_count: 2 }),
      async () => pricing()
    );

    assert.deepEqual(result, {
      value: 0.13158,
      primaryProceeds: 0.13058
    });
  });

  it("keeps exact gross value but rejects unverified primary proceeds", async () => {
    const transaction = makeHandleOpsTransaction(
      makeExecuteBatchCall([
        {
          target: MANIFOLD_LAZY_CLAIM_CONTRACT,
          value: ethers.parseEther("0.07"),
          data: makeMintData()
        }
      ])
    );

    const result = await resolveManifoldMintValues(
      transaction,
      row(),
      async () => pricing()
    );

    assert.deepEqual(result, {
      value: 0.07,
      primaryProceeds: null
    });
  });

  it("rejects calldata that does not match the database transfer row", async () => {
    const transaction = makeHandleOpsTransaction(
      makeExecuteBatchCall([
        {
          target: MANIFOLD_LAZY_CLAIM_CONTRACT,
          value: ethers.parseEther("0.06579"),
          data: makeMintData()
        }
      ])
    );

    assert.equal(
      await resolveManifoldMintValues(
        transaction,
        row({ to_address: BUNDLER }),
        async () => pricing()
      ),
      null
    );
    assert.equal(
      await resolveManifoldMintValues(
        transaction,
        row({ token_id: 538 }),
        async () => pricing()
      ),
      null
    );
    assert.equal(
      await resolveManifoldMintValues(
        transaction,
        row({ token_count: 2 }),
        async () => pricing()
      ),
      null
    );
  });
});
