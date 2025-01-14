import { Transaction } from "../../../db/entities/ITransaction";
import { areEqualAddresses, sleep } from "../../../../shared/helpers";
import { ethers, formatEther } from "ethers";
import { MANIFOLD_ADDRESS, NULL_ADDRESS } from "../../../../constants";
import { SEAPORT_IFACE } from "../../../../shared/abis/opensea";
import { NEXTGEN_CONTRACT } from "../../../../shared/abis/nextgen";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import Bottleneck from "bottleneck";

const ACK_DEPLOYER = "0x03ee832367e29a5cd001f65093283eabb5382b62";
const WETH_TOKEN_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const ROYALTIES_ADDRESS = "0x1b1289e34fe05019511d7b436a5138f361904df0";
const MEMELAB_ROYALTIES_ADDRESS = "0x900b67e6f16291431e469e6ec8208d17de09fc37";
const MEMES_DEPLOYER = "0x4B76837F8D8Ad0A28590d06E53dCD44b6B7D4554";
const MEMELAB_CONTRACT = "0x4db52a61dc491e15a2f78f5ac001c14ffe3568cb";
const NEXTGEN_ROYALTIES_ADDRESS = "0xC8ed02aFEBD9aCB14c33B5330c803feacAF01377";

const TRANSFER_EVENT =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const MINT_FROM_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const BLUR_EVENT =
  "0x7dc5c0699ac8dd5250cbe368a2fc3b4a2daadb120ad07f6cccea29f83482686e";

const MAX_CURRENT_LIMIT = 5;
const BOTTLENECK = new Bottleneck({ maxConcurrent: MAX_CURRENT_LIMIT });

function isZeroAddress(address: string) {
  return /^0x0+$/.test(address);
}

function resolveLogAddress(address: string) {
  if (!address) {
    return address;
  }
  if (isZeroAddress(address)) {
    return NULL_ADDRESS;
  }
  const addressHex = "0x" + address.slice(-40);
  return ethers.getAddress(addressHex);
}

function resolveLogValue(data: string) {
  if (data === "0x") {
    return 0;
  }
  return parseFloat(formatEther(data));
}

export const findTransactionValues = async (
  provider: ethers.Provider,
  transactions: Transaction[],
  printStatus: (...args: any[]) => void
) => {
  printStatus("> Processing values", transactions.length);

  const parseTransaction = async (t: Transaction): Promise<Transaction> => {
    const parsedTransaction = await resolveValue(provider, t, printStatus);
    await sleep(100);
    return parsedTransaction; // Explicitly returns Transaction
  };

  const transactionValuesPromises: Promise<Transaction>[] = transactions.map(
    (t) => BOTTLENECK.schedule(() => parseTransaction(t))
  );

  const transactionsWithValues = await Promise.all(transactionValuesPromises);

  printStatus("> Processed transaction values", transactionsWithValues.length);

  return transactionsWithValues;
};

async function resolveValue(
  provider: ethers.Provider,
  t: Transaction,
  printStatus: (...args: any[]) => void
) {
  const transaction = await provider.getTransaction(t.transaction);
  t.value = transaction ? parseFloat(formatEther(transaction.value)) : 0;
  t.royalties = 0;

  let royaltiesAddress = ROYALTIES_ADDRESS;
  if (areEqualAddresses(t.contract, MEMELAB_CONTRACT)) {
    royaltiesAddress = MEMELAB_ROYALTIES_ADDRESS;
  } else if (areEqualAddresses(t.contract, NEXTGEN_CONTRACT)) {
    royaltiesAddress = NEXTGEN_ROYALTIES_ADDRESS;
  }

  if (transaction) {
    const receipt = await provider.getTransactionReceipt(transaction?.hash);
    const logCount =
      receipt?.logs.filter(
        (l) =>
          areEqualAddresses(l.topics[0], TRANSFER_EVENT) &&
          areEqualAddresses(resolveLogAddress(l.topics[2]), t.to_address)
      ).length || 1;

    if (receipt?.gasUsed) {
      const gasUnits = Number(receipt.gasUsed);
      const gasPrice = parseFloat(formatEther(receipt.gasPrice));
      const gasPriceGwei =
        Math.round(gasPrice * 1000000000 * 100000000) / 100000000;
      const gas = Math.round(gasUnits * gasPrice * 100000000) / 100000000;

      t.gas_gwei = gasUnits;
      t.gas_price = gasPrice;
      t.gas_price_gwei = gasPriceGwei;
      t.gas = gas / logCount;
    }

    if (receipt) {
      let totalValue = 0;
      let totalRoyalties = 0;
      let seaportEvent = false;
      await Promise.all(
        receipt.logs.map(async (log) => {
          const parsedLog = await parseSeaportLog(
            t,
            royaltiesAddress,
            log,
            printStatus
          );
          if (
            parsedLog &&
            Number(parsedLog.tokenId) == t.token_id &&
            areEqualAddresses(parsedLog.contract, t.contract)
          ) {
            t.royalties = parsedLog.royaltiesAmount;
            t.value = parsedLog.totalAmount;
            seaportEvent = true;
          } else {
            if (isBlurEvent(log)) {
              const royaltiesResponse = await parseBlurLog(log);
              if (
                royaltiesResponse &&
                areEqualAddresses(
                  royaltiesResponse.feeRecipient,
                  royaltiesAddress
                )
              ) {
                const parsedRate = Number(royaltiesResponse.feeRate);
                const parsedRatePercentage = parsedRate / 100;
                const royaltiesAmount = t.value * (parsedRatePercentage / 100);
                t.royalties = royaltiesAmount;
              }
            } else if (
              areEqualAddresses(log.topics[0], TRANSFER_EVENT) &&
              !seaportEvent
            ) {
              try {
                const address = log.address;
                if (areEqualAddresses(address, WETH_TOKEN_ADDRESS)) {
                  const from = resolveLogAddress(log.topics[1]);
                  const to = resolveLogAddress(log.topics[2]);
                  const value = resolveLogValue(log.data) / logCount;
                  if (areEqualAddresses(from, t.to_address)) {
                    totalValue += value;
                  }
                  if (areEqualAddresses(to, royaltiesAddress)) {
                    totalRoyalties += value;
                  }
                } else if (
                  areEqualAddresses(log.topics[1], MINT_FROM_ADDRESS)
                ) {
                  totalValue = t.value / logCount;
                  totalRoyalties = 0;
                }
              } catch (e) {
                printStatus(
                  `> Error adding royalties for transaction ${t.transaction}`,
                  e
                );
              }
            }
          }
        })
      );
      if (totalValue) {
        t.value = totalValue;
        t.royalties = totalRoyalties;
      }
    }
  }

  if (
    (areEqualAddresses(t.contract, MEMES_CONTRACT) &&
      areEqualAddresses(t.from_address, NULL_ADDRESS)) ||
    areEqualAddresses(t.from_address, MANIFOLD_ADDRESS) ||
    (areEqualAddresses(t.from_address, ACK_DEPLOYER) &&
      areEqualAddresses(t.contract, MEMELAB_CONTRACT) &&
      t.token_id == 12)
  ) {
    const block = `0x${t.block.toString(16)}`;
    const internlTrfs = await getInternalTransfers(provider, t.contract, block);
    const filteredInternalTrfs = internlTrfs.filter(
      (it) =>
        it.transactionHash == t.transaction &&
        (areEqualAddresses(it.args.from, t.to_address) ||
          areEqualAddresses(it.args.from, MANIFOLD_ADDRESS) ||
          (it.args.to && areEqualAddresses(it.args.to, MEMES_DEPLOYER)))
    );

    if (filteredInternalTrfs.length > 0) {
      let primaryProceeds = 0;
      filteredInternalTrfs.forEach((internalT) => {
        if (internalT?.args?.value) {
          primaryProceeds += internalT.args.value;
        }
      });
      if (primaryProceeds) {
        t.primary_proceeds = primaryProceeds;
        t.value = primaryProceeds;
      }
    }

    if (!t.primary_proceeds) {
      t.primary_proceeds = t.value;
    }
  }

  t.value = parseFloat(t.value.toFixed(8));
  t.royalties = parseFloat(t.royalties.toFixed(8));
  t.primary_proceeds = parseFloat(t.primary_proceeds.toFixed(8));
  t.gas = parseFloat(t.gas.toFixed(8));
  t.gas_price = parseFloat(t.gas_price.toFixed(8));
  t.gas_price_gwei = parseFloat(t.gas_price_gwei.toFixed(8));
  t.gas_gwei = parseFloat(t.gas_gwei.toFixed(8));

  // TODO: Add this back in
  // const ethPrice = await getClosestEthUsdPrice(t.transaction_date);
  const ethPrice = 0;
  t.eth_price_usd = ethPrice;
  t.value_usd = t.value * ethPrice;
  t.gas_usd = t.gas * ethPrice;

  return t;
}

const parseSeaportLog = async (
  t: Transaction,
  royaltiesAddress: string,
  log: ethers.Log,
  printStatus: (...args: any[]) => void
) => {
  let seaResult;
  try {
    seaResult = SEAPORT_IFACE.parseLog(log);
  } catch (err: any) {
    printStatus(`> SEAPORT PARSE ERROR for transaction ${t.transaction}`, err);
    return null;
  }

  let recipientConsideration = seaResult?.args.consideration?.find((c: any) =>
    areEqualAddresses(c.recipient, t.from_address)
  );
  if (!recipientConsideration) {
    recipientConsideration = seaResult?.args.offer?.find((o: any) =>
      areEqualAddresses(o.recipient, t.from_address)
    );
  }

  const royaltiesConsideration = seaResult?.args.consideration?.find((c: any) =>
    areEqualAddresses(c.recipient, royaltiesAddress)
  );

  let tokenConsideration = seaResult?.args.consideration?.find((o: any) =>
    areEqualAddresses(o.token, t.contract)
  );
  if (!tokenConsideration) {
    tokenConsideration = seaResult?.args.offer?.find((o: any) =>
      areEqualAddresses(o.token, t.contract)
    );
  }

  if (tokenConsideration && recipientConsideration) {
    const contract = tokenConsideration.token;
    const tokenId = Number(tokenConsideration[2]);
    const royaltiesAmount = royaltiesConsideration
      ? parseFloat(formatEther(royaltiesConsideration.amount))
      : 0;

    let totalAmount = 0;

    seaResult?.args.offer
      ?.filter((o: any) => !areEqualAddresses(o.token, t.contract))
      ?.map((o: any) => {
        totalAmount += parseFloat(formatEther(o.amount));
      });

    if (totalAmount == 0) {
      seaResult?.args.consideration
        ?.filter((o: any) => !areEqualAddresses(o.token, contract))
        ?.map((o: any) => {
          totalAmount += parseFloat(formatEther(o.amount));
        });
    }

    return {
      contract,
      tokenId,
      royaltiesAmount,
      totalAmount,
    };
  }
};

const isBlurEvent = (log: ethers.Log) => {
  return areEqualAddresses(log.topics[0], BLUR_EVENT);
};

const parseBlurLog = async (log: { data: string }) => {
  try {
    const data = log.data;
    const dataWithoutPrefix = data.startsWith("0x") ? data.slice(2) : data;
    const packedFeeHex = "0x" + dataWithoutPrefix.slice(-64);

    const value = BigInt(packedFeeHex);

    // Use bit shift to calculate 2^160
    const twoTo160 = BigInt(1) << BigInt(160);
    const recipientMask = twoTo160 - BigInt(1);

    const feeRate = value / twoTo160;
    const feeRecipientBN = value & recipientMask;

    let feeRecipient = feeRecipientBN.toString(16);
    feeRecipient = feeRecipient.padStart(40, "0");
    feeRecipient = "0x" + feeRecipient;

    return { feeRate, feeRecipient };
  } catch (error) {
    console.error("Error unpacking fee:", error);
    return null;
  }
};

async function getInternalTransfers(
  provider: ethers.Provider,
  contractAddress: string,
  block: string
) {
  const tokenContract = new ethers.Contract(
    contractAddress,
    ["event Transfer(address indexed from, address indexed to, uint256 value)"],
    provider
  );
  const filter = tokenContract.filters.Transfer();
  const events = await tokenContract.queryFilter(filter, block, block);
  const eventLogs = events.filter((event): event is ethers.EventLog => {
    return (event as ethers.EventLog).topics !== undefined;
  });
  return eventLogs;
}
