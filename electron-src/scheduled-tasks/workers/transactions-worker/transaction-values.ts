import Bottleneck from "bottleneck";
import { ethers, formatEther } from "ethers";
import { MANIFOLD_ADDRESS, NULL_ADDRESS } from "../../../../electron-constants";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import { NEXTGEN_CONTRACT } from "../../../../shared/abis/nextgen";
import { areEqualAddresses, sleep } from "../../../../shared/helpers";
import { Transaction } from "../../../db/entities/ITransaction";
import { SEAPORT_IFACE } from "./seaport";

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

const OPENSEA_MATCH_EVENT =
  "0x4b9f2d36e1b4c93de62cc077b00b1a91d84b6c31b4a14e012718dcca230689e7";

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
      const attributeRow = attributeRowFromSeaportTx(
        receipt,
        t,
        royaltiesAddress,
        printStatus
      );

      if (attributeRow) {
        t.royalties = attributeRow.royalties;
        t.value = attributeRow.value;
      } else {
        let totalValue = 0;
        let totalRoyalties = 0;

        await Promise.all(
          receipt.logs.map(async (log) => {
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
            } else if (areEqualAddresses(log.topics[0], TRANSFER_EVENT)) {
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
                  `Error adding royalties for transaction ${t.transaction}`,
                  e
                );
              }
            }
          })
        );
        if (totalValue) {
          t.value = totalValue;
        }
        if (totalRoyalties) {
          t.royalties = totalRoyalties;
        }
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

type RowAttribution = {
  value: number; // the slice of the sale value for THIS row
  royalties: number; // royalties to the target recipient for THIS row
  currency: { itemType: number; token: string } | null; // 0x0.. for ETH
  orderHash?: string;
};

const ItemType = {
  NATIVE: 0,
  ERC20: 1,
  ERC721: 2,
  ERC1155: 3,
  ERC721_WITH_CRITERIA: 4,
  ERC1155_WITH_CRITERIA: 5,
} as const;

const IFACE = new ethers.Interface([
  // Seaport v1.6 events
  "event OrderFulfilled(bytes32 orderHash,address offerer,address zone,address recipient,(uint8 itemType,address token,uint256 identifier,uint256 amount)[] offer,(uint8 itemType,address token,uint256 identifier,uint256 amount,address recipient)[] consideration)",
  // ERC721 & ERC1155 Transfer events
  "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
  "event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)",
  "event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)",
]);

const isNftItemType = (t: number) =>
  t === ItemType.ERC721 ||
  t === ItemType.ERC1155 ||
  t === ItemType.ERC721_WITH_CRITERIA ||
  t === ItemType.ERC1155_WITH_CRITERIA;

const isCurrencyItemType = (t: number) =>
  t === ItemType.NATIVE || t === ItemType.ERC20;

/**
 * Parse ONE tx and attribute the exact value + royalties for ONE row (from,to,contract,tokenId).
 *
 * - `receipt` must be the full transaction receipt (we need all logs).
 * - `row` is your table row key.
 * - `royaltiesAddress` is the specific royalty recipient you're tracking (creator wallet/forwarder).
 * - `seaportAddress` is Seaport v1.6 address for the chain you’re on.
 */
function attributeRowFromSeaportTx(
  receipt: ethers.TransactionReceipt,
  row: Transaction,
  royaltiesAddress: string,
  printStatus: (...args: any[]) => void
): RowAttribution | null {
  // 1) Gather all NFT Transfers in this tx
  type NftEdge = {
    from: string;
    to: string;
    contract: string;
    tokenId: string;
    amount: bigint;
  };
  const nftEdges: NftEdge[] = [];

  for (const lg of receipt.logs) {
    // ERC721 Transfer
    if (
      lg.topics.length === 4 &&
      lg.topics[0] === IFACE.getEvent("Transfer")?.topicHash
    ) {
      const from = ethers.getAddress("0x" + lg.topics[1].slice(26));
      const to = ethers.getAddress("0x" + lg.topics[2].slice(26));
      const tokenId = BigInt(lg.topics[3]).toString();
      nftEdges.push({
        from,
        to,
        contract: lg.address,
        tokenId,
        amount: BigInt(1),
      });
      continue;
    }

    // ERC1155 TransferSingle
    if (lg.topics[0] === IFACE.getEvent("TransferSingle")?.topicHash) {
      const decoded = IFACE.decodeEventLog(
        "TransferSingle",
        lg.data,
        lg.topics
      );
      const from = decoded.from as string;
      const to = decoded.to as string;
      const id = decoded.id.toString();
      const value = BigInt(decoded.value.toString());
      nftEdges.push({
        from,
        to,
        contract: lg.address,
        tokenId: id,
        amount: value,
      });
      continue;
    }

    // ERC1155 TransferBatch
    if (lg.topics[0] === IFACE.getEvent("TransferBatch")?.topicHash) {
      const decoded = IFACE.decodeEventLog("TransferBatch", lg.data, lg.topics);
      const from = decoded.from as string;
      const to = decoded.to as string;

      const ids: bigint[] = Array.isArray((decoded as any)["ids"])
        ? ((decoded as any)["ids"] as bigint[])
        : [];

      const values: bigint[] = Array.isArray((decoded as any)["values"])
        ? ((decoded as any)["values"] as bigint[])
        : [];

      ids.forEach((bn, i) => {
        nftEdges.push({
          from,
          to,
          contract: lg.address,
          tokenId: bn.toString(),
          amount: BigInt(values?.[i]?.toString() ?? "0"),
        });
      });
    }
  }

  // 2) Parse Seaport OrderFulfilled events in this tx
  type OrderEvt = {
    orderHash: string;
    offerer: string;
    recipient: string;
    offerNfts: Array<{ contract: string; tokenId: string; amount: bigint }>;
    considerationNfts: Array<{
      contract: string;
      tokenId: string;
      amount: bigint;
    }>;
    currencySplits: Array<{
      itemType: number;
      token: string;
      amount: bigint;
      recipient: string;
    }>;
    currency: { itemType: number; token: string } | null;
    valueTotal: bigint; // retained but no longer used for group total
    offerCurrencyTotal: bigint; // NEW: sum of offer-side currency amounts
    considerationCurrencyTotal: bigint; // NEW: sum of consideration-side currency amounts
  };
  const OrderEvts: OrderEvt[] = [];

  for (const lg of receipt.logs) {
    let parsed: ethers.LogDescription | null = null;
    try {
      parsed = SEAPORT_IFACE.parseLog(lg);
    } catch {
      // fallback to minimal interface (version-agnostic)
      try {
        parsed = IFACE.parseLog(lg);
      } catch {
        parsed = null;
      }
    }
    if (!parsed || parsed.name !== "OrderFulfilled") continue;

    const orderHash = parsed.args.orderHash as string;
    const offerer = parsed.args.offerer as string;
    const recipient = parsed.args.recipient as string;

    // Safe access
    let offer: any[] = [];
    let consideration: any[] = [];
    try {
      offer = parsed.args.offer;
      consideration = parsed.args.consideration;
    } catch {
      continue;
    }

    const offerNfts = offer
      .filter((o) => isNftItemType(Number(o.itemType)))
      .map((o) => ({
        contract: o.token as string,
        tokenId: o.identifier.toString(),
        amount: BigInt(o.amount.toString()),
      }));

    const considerationNfts = consideration
      .filter((c) => isNftItemType(Number(c.itemType)))
      .map((c) => ({
        contract: c.token as string,
        tokenId: c.identifier.toString(),
        amount: BigInt(c.amount.toString()),
      }));

    // currency totals on both sides
    let totalOfferCurrency = BigInt(0);
    let currency: { itemType: number; token: string } | null = null;
    for (const o of offer) {
      const it = Number(o.itemType);
      if (isCurrencyItemType(it)) {
        try {
          totalOfferCurrency += BigInt(o.amount.toString());
          currency ??= { itemType: it, token: o.token as string };
        } catch (e: any) {
          printStatus(
            `Error adding currency for transaction ${row.transaction} [ERROR: ${e.message}]`
          );
        }
      }
    }

    const currencySplits: Array<{
      itemType: number;
      token: string;
      amount: bigint;
      recipient: string;
    }> = [];
    // If currency is not set yet, set it in the next loop (consideration)
    for (const c of consideration) {
      const it = Number(c.itemType);
      if (!isCurrencyItemType(it)) continue;
      const amt = BigInt(c.amount.toString());
      currency ??= { itemType: it, token: c.token };
      currencySplits.push({
        itemType: it,
        token: c.token as string,
        amount: amt,
        recipient: c.recipient as string,
      });
    }

    const totalConsiderationCurrency = currencySplits.reduce(
      (acc, s) => acc + s.amount,
      BigInt(0)
    );

    const valueTotal =
      totalOfferCurrency > totalConsiderationCurrency
        ? totalOfferCurrency
        : totalConsiderationCurrency;

    OrderEvts.push({
      orderHash,
      offerer,
      recipient,
      offerNfts,
      considerationNfts,
      currencySplits,
      currency,
      valueTotal,
      offerCurrencyTotal: totalOfferCurrency,
      considerationCurrencyTotal: totalConsiderationCurrency,
    });
  }

  if (OrderEvts.length === 0) return null;

  // 3) Find the ONE order event that corresponds to THIS row:
  // Try seller-side first (NFT in offer[], offerer === from, recipient === to), then seller-side loose, then buyer-side strict, then buyer-side loose, then fallback.
  const tok = row.contract;
  const idStr = row.token_id.toString();
  const edgeFrom = row.from_address;
  const edgeTo = row.to_address;

  // token matchers
  const tokenMatch = (i: { contract: string; tokenId: string }) =>
    areEqualAddresses(i.contract, tok) && i.tokenId === idStr;

  const hasOfferToken = (e: OrderEvt) => e.offerNfts.some(tokenMatch);
  const hasConsToken = (e: OrderEvt) => e.considerationNfts.some(tokenMatch);

  // predicates in your original priority order
  const strictSeller = (e: OrderEvt) =>
    areEqualAddresses(e.offerer, edgeFrom) &&
    areEqualAddresses(e.recipient, edgeTo) &&
    hasOfferToken(e);

  const relaxedSeller = (e: OrderEvt) =>
    areEqualAddresses(e.offerer, edgeFrom) && hasOfferToken(e);

  const strictBuyer = (e: OrderEvt) =>
    areEqualAddresses(e.recipient, edgeTo) && hasConsToken(e);

  const relaxedBuyer = (e: OrderEvt) =>
    hasConsToken(e) &&
    (areEqualAddresses(e.offerer, edgeFrom) ||
      areEqualAddresses(e.recipient, edgeTo));

  const lastResort = (): OrderEvt | undefined => {
    const refs = OrderEvts.filter((e) => hasOfferToken(e) || hasConsToken(e));
    return refs.length === 1 ? refs[0] : undefined;
  };

  // find in sequence; `find` returns `undefined` when not found, so `??` is perfect
  const chosen: OrderEvt | undefined =
    OrderEvts.find(strictSeller) ??
    OrderEvts.find(relaxedSeller) ??
    OrderEvts.find(strictBuyer) ??
    OrderEvts.find(relaxedBuyer) ??
    lastResort();

  if (!chosen) return null;

  // --- Operator/Conduit guard ---
  // In Seaport fills, NFTs can move seller -> conduit/operator -> buyer.
  // Our DB may have TWO edges for the same token in the same tx:
  //   1) seller -> operator
  //   2) operator -> buyer
  // We must attribute price/royalties ONLY to the public ownership transfer
  // that lands at the actual buyer (the OrderFulfilled.recipient).
  // If we can see an NFT transfer that ends at the recipient for this token,
  // we require the current row to match that edge; otherwise, we skip attribution
  // for the operator hop to avoid double counting.
  try {
    const tokenEdgesForTx = nftEdges.filter(
      (e) =>
        areEqualAddresses(e.contract, row.contract) &&
        e.tokenId === row.token_id.toString()
    );
    const buyerEdge = tokenEdgesForTx.find((e) =>
      areEqualAddresses(e.to, chosen.recipient)
    );
    if (buyerEdge) {
      // There is an explicit transfer to the buyer in this tx for this token.
      // Only attribute to the row that ends at the buyer; skip seller->operator leg.
      if (!areEqualAddresses(row.to_address, chosen.recipient)) {
        return {
          value: 0,
          royalties: 0,
          currency: chosen.currency ?? null,
          orderHash: chosen.orderHash,
        };
      }
    }
  } catch (e: any) {
    printStatus(
      `Error adding currency for transaction ${row.transaction} [ERROR: ${e.message}]`
    );
  }

  // 4f) If OrdersMatched is present and includes this chosen orderHash, aggregate currency across the matched pair
  let mergedCurrencySplits = chosen.currencySplits.slice();
  let mergedOfferNfts = chosen.offerNfts.slice();
  let mergedConsiderationNfts = chosen.considerationNfts.slice();
  let mergedCurrency: { itemType: number; token: string } | null =
    chosen.currency;
  let mergedOfferCurrencyTotal: bigint = chosen.offerCurrencyTotal;
  let mergedConsiderationCurrencyTotal: bigint =
    chosen.considerationCurrencyTotal;

  try {
    // find OrdersMatched logs and parse their orderHashes
    const matchLogs = receipt.logs.filter((lg) =>
      areEqualAddresses(lg.topics?.[0], OPENSEA_MATCH_EVENT)
    );
    for (const ml of matchLogs) {
      let parsedMatch: ethers.LogDescription | null = null;
      try {
        parsedMatch = SEAPORT_IFACE.parseLog(ml);
      } catch {
        try {
          parsedMatch = IFACE.parseLog(ml);
        } catch {
          parsedMatch = null;
        }
      }
      if (!parsedMatch || parsedMatch.name !== "OrdersMatched") continue;
      const hashes: string[] = (parsedMatch.args.orderHashes as string[]) || [];
      if (!hashes.length) continue;
      if (hashes.some((h) => areEqualAddresses(h, chosen.orderHash))) {
        // collect sibling orders from this match
        const siblings = OrderEvts.filter((e) =>
          hashes.some((h) => areEqualAddresses(h, e.orderHash))
        );
        // Collect ALL NFT items across the entire matched group (for fallback/guard logic)
        const siblingsAllNftItems = siblings.flatMap((e) => [
          ...e.offerNfts,
          ...e.considerationNfts,
        ]);
        const siblingsAllDistinctTokens = new Set(
          siblingsAllNftItems.map(
            (i) => `${i.contract.toLowerCase()}:${i.tokenId}`
          )
        );
        // Merge ONLY sibling orders that reference THIS token (offer or consideration) to avoid summing unrelated items
        const relevant = siblings.filter(
          (e) =>
            e.offerNfts.some(
              (i) => areEqualAddresses(i.contract, tok) && i.tokenId === idStr
            ) ||
            e.considerationNfts.some(
              (i) => areEqualAddresses(i.contract, tok) && i.tokenId === idStr
            )
        );
        if (relevant.length >= 1) {
          // ensure chosen is included
          if (
            !relevant.some((e) =>
              areEqualAddresses(e.orderHash, chosen.orderHash)
            )
          ) {
            relevant.push(chosen);
          }
          mergedCurrencySplits = [];
          mergedOfferNfts = [];
          mergedConsiderationNfts = [];
          mergedCurrency = chosen.currency; // keep first seen
          mergedOfferCurrencyTotal = BigInt(0);
          mergedConsiderationCurrencyTotal = BigInt(0);
          for (const ev of relevant) {
            mergedOfferNfts.push(...ev.offerNfts);
            mergedConsiderationNfts.push(...ev.considerationNfts);
            if (!mergedCurrency && ev.currency) mergedCurrency = ev.currency;
            mergedCurrencySplits.push(...ev.currencySplits);
            mergedOfferCurrencyTotal += ev.offerCurrencyTotal;
            mergedConsiderationCurrencyTotal += ev.considerationCurrencyTotal;
          }
          // Save group-level counts for fallback decision later
          (mergedCurrencySplits as any)._matchedGroupDistinctTokenCount =
            siblingsAllDistinctTokens.size;
        }
        break; // only need to process the first match group containing chosen
      }
    }
  } catch (e: any) {
    printStatus(
      `Error adding currency for transaction ${row.transaction} [ERROR: ${e.message}]`
    );
  }

  // 4) If the chosen/matched group sold multiple NFTs, allocate within THIS GROUP only by executed units.
  const inOffer = mergedOfferNfts.some(
    (i) =>
      areEqualAddresses(i.contract, row.contract) &&
      i.tokenId === row.token_id.toString()
  );
  const groupNftItems =
    inOffer && mergedOfferNfts.length > 0
      ? mergedOfferNfts
      : mergedConsiderationNfts;

  // Check if the ENTIRE matched group contains only this one token (across all siblings)
  const groupAllNftItems = [...mergedOfferNfts, ...mergedConsiderationNfts];
  const distinctTokens = new Set(
    groupAllNftItems.map((i) => `${i.contract.toLowerCase()}:${i.tokenId}`)
  );
  const onlyThisToken =
    distinctTokens.size === 1 &&
    distinctTokens.has(
      `${row.contract.toLowerCase()}:${row.token_id.toString()}`
    );

  const groupTotalUnits = groupNftItems.reduce(
    (acc, i) => acc + i.amount,
    BigInt(0)
  );
  const groupThisUnits = groupNftItems
    .filter(
      (i) =>
        areEqualAddresses(i.contract, row.contract) &&
        i.tokenId === row.token_id.toString()
    )
    .reduce((acc, i) => acc + i.amount, BigInt(0));

  if (groupTotalUnits === BigInt(0) || groupThisUnits === BigInt(0))
    return null;

  // Use the larger of offer-side vs consideration-side currency totals across the matched group (prevents double-counting when both sides include full price)
  let groupTotalCurrency =
    mergedOfferCurrencyTotal > mergedConsiderationCurrencyTotal
      ? mergedOfferCurrencyTotal
      : mergedConsiderationCurrencyTotal;
  const groupRoyaltiesToTarget = mergedCurrencySplits
    .filter((s) => areEqualAddresses(s.recipient, royaltiesAddress))
    .reduce((acc, s) => acc + s.amount, BigInt(0));

  // Fallback: if Seaport consideration splits missed the seller-proceeds (common when split across paired orders),
  // derive total price from ERC20 Transfer logs where buyer (row.to_address) is the sender.
  // This only applies for ERC20 currency (e.g., WETH). ERC20 Transfer has 3 topics: [Transfer, from, to] and amount in data.
  try {
    if (mergedCurrency && mergedCurrency.itemType === ItemType.ERC20) {
      const erc20TransferTopic = IFACE.getEvent("Transfer")?.topicHash; // same signature as ERC721, but ERC20 uses 3 topics
      let buyerOut = BigInt(0);
      for (const lg of receipt.logs) {
        if (
          lg.topics &&
          lg.topics.length === 3 &&
          lg.topics[0] === erc20TransferTopic &&
          areEqualAddresses(lg.address, mergedCurrency.token)
        ) {
          const from = ethers.getAddress("0x" + lg.topics[1].slice(26));
          if (areEqualAddresses(from, row.to_address)) {
            // amount is in data for ERC20 Transfer
            const amt = BigInt(lg.data);
            buyerOut += amt;
          }
        }
      }
      // Only apply buyer-outflow fallback when the matched group effectively involved ONE token total (no sweep/bundle).
      const matchedGroupDistinctTokenCount: number =
        (mergedCurrencySplits as any)._matchedGroupDistinctTokenCount ?? 0;
      const safeToOverride = matchedGroupDistinctTokenCount === 1;
      if (safeToOverride && buyerOut > groupTotalCurrency) {
        // override groupTotalCurrency with on-chain ERC20 outflow from the buyer (single-token group only)
        groupTotalCurrency = buyerOut;
      }
    }
  } catch (e: any) {
    printStatus(
      `Error adding currency for transaction ${row.transaction} [ERROR: ${e.message}]`
    );
  }

  // If the group is only this token, take the full totals (no prorating). Otherwise, prorate by executed units.
  const valueWeiPart = onlyThisToken
    ? groupTotalCurrency
    : (groupTotalCurrency * groupThisUnits) / groupTotalUnits;
  const royaltiesWeiPart = onlyThisToken
    ? groupRoyaltiesToTarget
    : (groupRoyaltiesToTarget * groupThisUnits) / groupTotalUnits;

  if (valueWeiPart === BigInt(0) && royaltiesWeiPart === BigInt(0)) return null;

  return {
    value: parseFloat(formatEther(valueWeiPart)),
    royalties: parseFloat(formatEther(royaltiesWeiPart)),
    currency: mergedCurrency,
    orderHash: chosen.orderHash,
  };
}
