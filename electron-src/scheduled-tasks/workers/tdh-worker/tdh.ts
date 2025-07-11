import { parentPort } from "worker_threads";
import { DefaultBoost, TDH, TokenTDH } from "../../../db/entities/ITDH";
import { NFT } from "../../../db/entities/INFT";
import {
  BaseTransaction,
  Transaction,
} from "../../../db/entities/ITransaction";

import { areEqualAddresses, getDaysDiff } from "../../../../shared/helpers";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import { GRADIENT_CONTRACT } from "../../../../shared/abis/gradient";
import { NEXTGEN_CONTRACT } from "../../../../shared/abis/nextgen";
import { DataSource, In, LessThanOrEqual } from "typeorm";
import { logInfo, sendStatusUpdate } from "../../worker-helpers";
import { extractNFTOwners } from "../transactions-worker/nft-owners";
import { Time } from "../../../../shared/time";
import {
  fetchAllConsolidationAddresses,
  fetchTDHForBlock,
  fetchWalletTransactions,
  persistTDH,
  persistTDHBlock,
  retrieveWalletConsolidations,
} from "./tdh-worker.db";
import { ScheduledWorkerStatus } from "../../../../shared/types";
import {
  MEME_8_BURN_TRANSACTION,
  MEME_8_EDITION_BURN_ADJUSTMENT,
  NULL_ADDRESS,
} from "../../../../electron-constants";
import { consolidateTDH } from "./tdh-worker.consolidation";
import { processNftTdh } from "./tdh-worker.nfts";
import { ethers } from "ethers";
export const TDH_CONTRACTS = [
  MEMES_CONTRACT,
  GRADIENT_CONTRACT,
  NEXTGEN_CONTRACT,
];

export interface MemesSeason {
  id: number;
  start_index: number;
  end_index: number;
  count: number;
}

export function consolidateTransactions(
  transactions: BaseTransaction[]
): BaseTransaction[] {
  const consolidatedTransactions: BaseTransaction[] = Object.values(
    transactions.reduce((acc: any, transaction) => {
      const primaryKey = `${transaction.transaction}_${transaction.from_address}_${transaction.to_address}_${transaction.contract}_${transaction.token_id}`;

      if (!acc[primaryKey]) {
        acc[primaryKey] = transaction;
      }

      return acc;
    }, {})
  );
  return consolidatedTransactions;
}

export function getDefaultBoost(): DefaultBoost {
  return {
    memes_card_sets: {
      available: 0.59,
      available_info: [
        "0.55 for Full Collection Set",
        "0.02 for each additional set up to 2",
      ],
      acquired: 0,
      acquired_info: [],
    },
    memes_szn1: {
      available: 0.05,
      available_info: ["0.05 for Season 1 Set"],
      acquired: 0,
      acquired_info: [],
    },
    memes_szn2: {
      available: 0.05,
      available_info: ["0.05 for Season 2 Set"],
      acquired: 0,
      acquired_info: [],
    },
    memes_szn3: {
      available: 0.05,
      available_info: ["0.05 for Season 3 Set"],
      acquired: 0,
      acquired_info: [],
    },
    memes_szn4: {
      available: 0.05,
      available_info: ["0.05 for Season 4 Set"],
      acquired: 0,
      acquired_info: [],
    },
    memes_szn5: {
      available: 0.05,
      available_info: ["0.05 for Season 5 Set"],
      acquired: 0,
      acquired_info: [],
    },
    memes_szn6: {
      available: 0.05,
      available_info: ["0.05 for Season 6 Set"],
      acquired: 0,
      acquired_info: [],
    },
    memes_szn7: {
      available: 0.05,
      available_info: ["0.05 for Season 7 Set"],
      acquired: 0,
      acquired_info: [],
    },
    memes_szn8: {
      available: 0.05,
      available_info: ["0.05 for Season 8 Set"],
      acquired: 0,
      acquired_info: [],
    },
    memes_szn9: {
      available: 0.05,
      available_info: ["0.05 for Season 9 Set"],
      acquired: 0,
      acquired_info: [],
    },
    memes_szn10: {
      available: 0.05,
      available_info: ["0.05 for Season 10 Set"],
      acquired: 0,
      acquired_info: [],
    },
    memes_szn11: {
      available: 0.05,
      available_info: ["0.05 for Season 11 Set"],
      acquired: 0,
      acquired_info: [],
    },
    memes_genesis: {
      available: 0.01,
      available_info: ["0.01 for Meme Cards #1, #2, #3 (Genesis Set)"],
      acquired: 0,
      acquired_info: [],
    },
    memes_nakamoto: {
      available: 0.01,
      available_info: ["0.01 for Meme Card #4 (NakamotoFreedom)"],
      acquired: 0,
      acquired_info: [],
    },
    gradients: {
      available: 0.06,
      available_info: ["0.02 for each Gradient up to 3"],
      acquired: 0,
      acquired_info: [],
    },
  };
}

export function createMemesData() {
  return {
    memes_tdh: 0,
    memes_tdh__raw: 0,
    memes_balance: 0,
    boosted_memes_tdh: 0,
    memes_ranks: [],
  };
}

export const buildSeasons = (memes: NFT[]) => {
  const seasons: MemesSeason[] = [];
  let start = 0;
  let end = 0;
  let count = 0;
  let seasonId = 1;
  for (const meme of memes) {
    if (meme.season == seasonId) {
      count++;
      end = meme.id;
    } else {
      seasons.push({
        id: seasonId,
        start_index: start,
        end_index: end,
        count: count,
      });
      seasonId++;
      start = meme.id;
      end = meme.id;
      count = 1;
    }
  }
  seasons.push({
    id: seasonId,
    start_index: start,
    end_index: end,
    count: count,
  });
  return seasons;
};

export const calculateTDH = async (
  db: DataSource,
  block: number,
  lastTDHCalc: Date,
  blockTimestamp: Time,
  startingWallets?: string[]
): Promise<{ block: number; merkleRoot: string }> => {
  logInfo(
    parentPort,
    `[BLOCK ${block}] [TDH TIME ${lastTDHCalc.toLocaleString()}]`
  );
  if (startingWallets) {
    logInfo(parentPort, `[STARTING WALLETS ${startingWallets.length}]`);
  }

  const transactions = await db.getRepository(Transaction).find({
    where: {
      block: LessThanOrEqual(block),
      contract: In(TDH_CONTRACTS),
    },
  });

  logInfo(parentPort, `[TRANSACTIONS ${transactions.length}]`);

  const owners = await extractNFTOwners(transactions);

  logInfo(parentPort, `[OWNERS ${owners.length}]`);

  const memeOwners = owners.filter((o) =>
    areEqualAddresses(o.contract, MEMES_CONTRACT)
  );
  const gradientOwners = owners.filter((o) =>
    areEqualAddresses(o.contract, GRADIENT_CONTRACT)
  );
  const nextgenOwners = owners.filter((o) =>
    areEqualAddresses(o.contract, NEXTGEN_CONTRACT)
  );

  const nftRepository = db.getRepository(NFT);
  const initialMemes = await nftRepository.find({
    where: {
      contract: MEMES_CONTRACT,
    },
  });
  const gradients = await nftRepository.find({
    where: {
      contract: GRADIENT_CONTRACT,
    },
  });
  const nextgen = await nftRepository.find({
    where: {
      contract: NEXTGEN_CONTRACT,
    },
  });

  const memes = initialMemes
    .filter(
      (m) =>
        m.mint_date &&
        Time.seconds(m.mint_date).lte(Time.fromDate(lastTDHCalc).minusDays(1))
    )
    .map((m) => {
      const tokenOwners = memeOwners.filter((o) => o.token_id === m.id);
      let editionSize = tokenOwners.reduce((acc, o) => acc + o.balance, 0);
      if (m.id === 8) {
        editionSize += MEME_8_EDITION_BURN_ADJUSTMENT;
      }
      logInfo(parentPort, `[MEME ${m.id}] [EDITION SIZE ${editionSize}]`);
      return { ...m, edition_size: editionSize };
    });
  memes.sort((a, b) => a.id - b.id);

  const ADJUSTED_SEASONS = buildSeasons(memes);

  logInfo(
    parentPort,
    `[MEMES] : [TOKENS ${memes.length}] : [OWNERS ${memeOwners.length}] : [SEASONS ${ADJUSTED_SEASONS.length}]`
  );
  logInfo(
    parentPort,
    `[GRADIENTS] : [TOKENS ${gradients.length}] : [OWNERS ${gradientOwners.length}]`
  );
  logInfo(
    parentPort,
    `[NEXTGEN] : [TOKENS ${nextgen.length}] : [OWNERS ${nextgenOwners.length}]`
  );

  const ADJUSTED_NFTS = [...memes, ...gradients, ...nextgen];
  const HODL_INDEX = ADJUSTED_NFTS.reduce(
    (acc, m) => Math.max(acc, m.edition_size),
    0
  );
  logInfo(parentPort, `[HODL_INDEX ${HODL_INDEX}]`);

  const combinedAddresses = new Set<string>();

  if (startingWallets) {
    startingWallets.forEach((w) => combinedAddresses.add(w));
    logInfo(parentPort, `[STARTING UNIQUE WALLETS ${combinedAddresses.size}]`);
  } else {
    const consolidationAddresses: { wallet: string }[] =
      await fetchAllConsolidationAddresses(db);
    consolidationAddresses.forEach((w) =>
      combinedAddresses.add(w.wallet.toLowerCase())
    );

    owners.forEach((w) => combinedAddresses.add(w.address.toLowerCase()));
  }

  logInfo(
    parentPort,
    `[BLOCK ${block}] [WALLETS ${combinedAddresses.size}] [CALCULATING TDH - START]`
  );
  sendStatusUpdate(parentPort, {
    update: {
      status: ScheduledWorkerStatus.RUNNING,
      message: `[1/2] Block ${block} - Calculating TDH`,
    },
  });

  const walletsTDH: TDH[] = [];
  const allGradientsTDH: any[] = [];
  const allNextgenTDH: any[] = [];

  await Promise.all(
    Array.from(combinedAddresses).map(async (owner) => {
      const wallet = owner.toLowerCase();
      const consolidations = await retrieveWalletConsolidations(db, wallet);

      const walletMemes: any[] = [];
      let unique_memes = 0;
      const walletGradients: any[] = [];
      const walletNextgen: any[] = [];

      let totalTDH = 0;
      let totalTDH__raw = 0;
      let totalBalance = 0;
      const memesData = createMemesData();

      let gradientsBalance = 0;
      let gradientsTDH = 0;
      let gradientsTDH__raw = 0;

      let nextgenBalance = 0;
      let nextgenTDH = 0;
      let nextgenTDH__raw = 0;

      let consolidationTransactions: Transaction[] = [];
      await Promise.all(
        consolidations.map(async (c) => {
          const transactions = await fetchWalletTransactions(
            db,
            TDH_CONTRACTS,
            c,
            block
          );
          consolidationTransactions =
            consolidationTransactions.concat(transactions);
        })
      );

      consolidationTransactions = consolidateTransactions(
        consolidationTransactions
      ).sort((a, b) => a.transaction_date - b.transaction_date);

      if (areEqualAddresses(wallet, NULL_ADDRESS)) {
        consolidationTransactions = consolidationTransactions.filter(
          (t) => !areEqualAddresses(t.transaction, MEME_8_BURN_TRANSACTION)
        );
      }

      ADJUSTED_NFTS.forEach((nft) => {
        const tokenConsolidatedTransactions = [
          ...consolidationTransactions,
        ].filter(
          (t) =>
            t.token_id == nft.id &&
            areEqualAddresses(t.contract, nft.contract) &&
            !areEqualAddresses(t.from_address, t.to_address)
        );

        const hodlRate = HODL_INDEX / nft.edition_size;

        const tokenTDH = getTokenTdh(
          lastTDHCalc,
          nft.id,
          hodlRate,
          wallet,
          consolidations,
          tokenConsolidatedTransactions
        );

        if (tokenTDH) {
          totalTDH += tokenTDH.tdh;
          totalTDH__raw += tokenTDH.tdh__raw;
          totalBalance += tokenTDH.balance;

          if (areEqualAddresses(nft.contract, MEMES_CONTRACT)) {
            memesData.memes_tdh += tokenTDH.tdh;
            memesData.memes_tdh__raw += tokenTDH.tdh__raw;
            unique_memes++;
            memesData.memes_balance += tokenTDH.balance;
            walletMemes.push(tokenTDH);
          } else if (areEqualAddresses(nft.contract, GRADIENT_CONTRACT)) {
            gradientsTDH += tokenTDH.tdh;
            gradientsTDH__raw += tokenTDH.tdh__raw;
            gradientsBalance += tokenTDH.balance;
            walletGradients.push(tokenTDH);
          } else if (areEqualAddresses(nft.contract, NEXTGEN_CONTRACT)) {
            nextgenTDH += tokenTDH.tdh;
            nextgenTDH__raw += tokenTDH.tdh__raw;
            nextgenBalance += tokenTDH.balance;
            walletNextgen.push(tokenTDH);
          }
        }
      });

      let memesCardSets = 0;
      if (walletMemes.length == memes.length) {
        memesCardSets = Math.min(
          ...[...walletMemes].map(function (o) {
            return o.balance;
          })
        );
      }

      const genNaka = getGenesisAndNaka(walletMemes);

      const tdh: TDH = {
        date: new Date(),
        wallet: wallet,
        tdh_rank: 0, //assigned later
        tdh_rank_memes: 0, //assigned later
        tdh_rank_gradients: 0, //assigned later
        tdh_rank_nextgen: 0, //assigned later
        block: block,
        tdh: totalTDH,
        boost: 0,
        boosted_tdh: 0,
        tdh__raw: totalTDH__raw,
        balance: totalBalance,
        memes_cards_sets: memesCardSets,
        genesis: genNaka.genesis,
        nakamoto: genNaka.naka,
        unique_memes: unique_memes,
        memes_tdh: memesData.memes_tdh,
        memes_tdh__raw: memesData.memes_tdh__raw,
        memes_balance: memesData.memes_balance,
        boosted_memes_tdh: memesData.boosted_memes_tdh,
        memes_ranks: memesData.memes_ranks,
        memes: walletMemes,
        boosted_gradients_tdh: 0,
        gradients_tdh: gradientsTDH,
        gradients_tdh__raw: gradientsTDH__raw,
        gradients_balance: gradientsBalance,
        gradients: walletGradients,
        gradients_ranks: [],
        boosted_nextgen_tdh: 0,
        nextgen_tdh: nextgenTDH,
        nextgen_tdh__raw: nextgenTDH__raw,
        nextgen_balance: nextgenBalance,
        nextgen: walletNextgen,
        nextgen_ranks: [],
        boost_breakdown: {},
      };
      walletGradients.forEach((wg) => {
        allGradientsTDH.push(wg);
      });
      walletNextgen.forEach((wn) => {
        allNextgenTDH.push(wn);
      });
      walletsTDH.push(tdh);
    })
  );

  logInfo(
    parentPort,
    `[BLOCK ${block}] [WALLETS ${combinedAddresses.size}] [CALCULATING BOOSTS]`
  );
  sendStatusUpdate(parentPort, {
    update: {
      status: ScheduledWorkerStatus.RUNNING,
      message: `[1/2] Block ${block} - Calculating Boosts`,
    },
  });

  const boostedTdh = await calculateBoosts(ADJUSTED_SEASONS, walletsTDH);

  let rankedTdh: TDH[];
  if (startingWallets) {
    const allCurrentTdh = await fetchTDHForBlock(db, block);
    const allTdh = allCurrentTdh
      .filter(
        (t: TDH) =>
          !startingWallets.some((sw) => areEqualAddresses(sw, t.wallet))
      )
      .concat(boostedTdh);
    const allRankedTdh = await calculateRanks(
      allGradientsTDH,
      allNextgenTDH,
      allTdh,
      ADJUSTED_NFTS
    );
    rankedTdh = allRankedTdh.filter((t: TDH) =>
      startingWallets.some((sw) => areEqualAddresses(sw, t.wallet))
    );
  } else {
    rankedTdh = await calculateRanks(
      allGradientsTDH,
      allNextgenTDH,
      boostedTdh,
      ADJUSTED_NFTS
    );
  }

  logInfo(
    parentPort,
    `[BLOCK ${block}] [WALLETS ${rankedTdh.length}] [UPDATING DATABASE]`
  );
  sendStatusUpdate(parentPort, {
    update: {
      status: ScheduledWorkerStatus.RUNNING,
      message: `[1/2] Block ${block} - Updating Database`,
    },
  });

  await persistTDH(db, block, rankedTdh, startingWallets);

  logInfo(
    parentPort,
    `[BLOCK ${block}] [WALLETS ${rankedTdh.length}] [DATABASE UPDATED]`
  );
  sendStatusUpdate(parentPort, {
    update: {
      status: ScheduledWorkerStatus.RUNNING,
      message: `[1/2] Block ${block} - Database Updated`,
    },
  });

  await consolidateTDH(db, block, ADJUSTED_NFTS, startingWallets);
  await processNftTdh(db, ADJUSTED_NFTS);

  const merkleRoot = await persistTDHBlock(db, block, blockTimestamp);

  return {
    block,
    merkleRoot,
  };
};

function hasSeasonSet(
  seasonId: number,
  seasons: MemesSeason[],
  memes: TokenTDH[]
): boolean {
  const season = seasons.find((s) => s.id == seasonId);
  if (!season) {
    return false;
  }
  const seasonMemes = memes.filter(
    (m) => m.id >= season.start_index && m.id <= season.end_index
  );

  return seasonMemes.length === season.count;
}

function calculateMemesBoostsCardSets(cardSets: number) {
  let boost = 1;
  const breakdown = getDefaultBoost();

  let cardSetBreakdown = 0.55;
  const additionalCardSets = cardSets - 1;
  // additional full sets up to 2
  cardSetBreakdown += Math.min(additionalCardSets * 0.02, 0.04);
  boost += cardSetBreakdown;
  breakdown.memes_card_sets.acquired = cardSetBreakdown;

  const acquiredInfo = ["0.55 for Full Collection Set"];
  if (additionalCardSets === 1) {
    acquiredInfo.push(`0.02 for 1 additional set`);
  } else if (additionalCardSets > 1) {
    acquiredInfo.push(`0.04 for ${additionalCardSets} additional sets`);
  }
  breakdown.memes_card_sets.acquired_info = acquiredInfo;

  return {
    boost: boost,
    breakdown: breakdown,
  };
}

function calculateMemesBoostsSeasons(
  seasons: MemesSeason[],
  s1Extra: {
    genesis: number;
    nakamoto: number;
  },
  memes: TokenTDH[]
) {
  let boost = 1;
  const breakdown = getDefaultBoost();

  const cardSetS1 = hasSeasonSet(1, seasons, memes);
  const cardSetS2 = hasSeasonSet(2, seasons, memes);
  const cardSetS3 = hasSeasonSet(3, seasons, memes);
  const cardSetS4 = hasSeasonSet(4, seasons, memes);
  const cardSetS5 = hasSeasonSet(5, seasons, memes);
  const cardSetS6 = hasSeasonSet(6, seasons, memes);
  const cardSetS7 = hasSeasonSet(7, seasons, memes);
  const cardSetS8 = hasSeasonSet(8, seasons, memes);
  const cardSetS9 = hasSeasonSet(9, seasons, memes);
  const cardSetS10 = hasSeasonSet(10, seasons, memes);
  const cardSetS11 = hasSeasonSet(11, seasons, memes);

  if (cardSetS1) {
    boost += 0.05;
    breakdown.memes_szn1.acquired = 0.05;
    breakdown.memes_szn1.acquired_info = ["0.05 for holding Season 1 Set"];
  } else {
    if (s1Extra.genesis) {
      boost += 0.01;
      breakdown.memes_genesis.acquired = 0.01;
      breakdown.memes_genesis.acquired_info = [
        "0.01 for holding Meme Cards #1, #2, #3 (Genesis Set)",
      ];
    }
    if (s1Extra.nakamoto) {
      boost += 0.01;
      breakdown.memes_nakamoto.acquired = 0.01;
      breakdown.memes_nakamoto.acquired_info = [
        "0.01 for holding Meme Cards #4 (NakamotoFreedom)",
      ];
    }
  }
  if (cardSetS2) {
    boost += 0.05;
    breakdown.memes_szn2.acquired = 0.05;
    breakdown.memes_szn2.acquired_info = ["0.05 for holding Season 2 Set"];
  }
  if (cardSetS3) {
    boost += 0.05;
    breakdown.memes_szn3.acquired = 0.05;
    breakdown.memes_szn3.acquired_info = ["0.05 for holding Season 3 Set"];
  }
  if (cardSetS4) {
    boost += 0.05;
    breakdown.memes_szn4.acquired = 0.05;
    breakdown.memes_szn4.acquired_info = ["0.05 for holding Season 4 Set"];
  }
  if (cardSetS5) {
    boost += 0.05;
    breakdown.memes_szn5.acquired = 0.05;
    breakdown.memes_szn5.acquired_info = ["0.05 for holding Season 5 Set"];
  }
  if (cardSetS6) {
    boost += 0.05;
    breakdown.memes_szn6.acquired = 0.05;
    breakdown.memes_szn6.acquired_info = ["0.05 for holding Season 6 Set"];
  }
  if (cardSetS7) {
    boost += 0.05;
    breakdown.memes_szn7.acquired = 0.05;
    breakdown.memes_szn7.acquired_info = ["0.05 for holding Season 7 Set"];
  }
  if (cardSetS8) {
    boost += 0.05;
    breakdown.memes_szn8.acquired = 0.05;
    breakdown.memes_szn8.acquired_info = ["0.05 for holding Season 8 Set"];
  }
  if (cardSetS9) {
    boost += 0.05;
    breakdown.memes_szn9.acquired = 0.05;
    breakdown.memes_szn9.acquired_info = ["0.05 for holding Season 9 Set"];
  }
  if (cardSetS10) {
    boost += 0.05;
    breakdown.memes_szn10.acquired = 0.05;
    breakdown.memes_szn10.acquired_info = ["0.05 for holding Season 10 Set"];
  }
  if (cardSetS11) {
    boost += 0.05;
    breakdown.memes_szn11.acquired = 0.05;
    breakdown.memes_szn11.acquired_info = ["0.05 for holding Season 11 Set"];
  }

  return {
    boost: boost,
    breakdown: breakdown,
  };
}

function calculateMemesBoosts(
  cardSets: number,
  seasons: MemesSeason[],
  s1Extra: {
    genesis: number;
    nakamoto: number;
  },
  memes: TokenTDH[]
) {
  if (cardSets > 0) {
    /* Category A */
    return calculateMemesBoostsCardSets(cardSets);
  } else {
    /* Category B */
    return calculateMemesBoostsSeasons(seasons, s1Extra, memes);
  }
}

export function calculateBoost(
  seasons: MemesSeason[],
  cardSets: number,
  s1Extra: {
    genesis: number;
    nakamoto: number;
  },
  memes: TokenTDH[],
  gradients: any[]
) {
  let { boost, breakdown } = calculateMemesBoosts(
    cardSets,
    seasons,
    s1Extra,
    memes
  );

  // GRADIENTS up to 3
  const gradientsBoost = Math.min(gradients.length * 0.02, 0.06);
  if (gradientsBoost > 0) {
    breakdown.gradients.acquired = gradientsBoost;
    breakdown.gradients.acquired_info = [
      `${gradientsBoost} for holding ${gradients.length} Gradient${
        gradients.length > 1 ? "s" : ""
      }`,
    ];
    boost += gradientsBoost;
  }

  const total = Math.round(boost * 100) / 100;

  return {
    total: total,
    breakdown: breakdown,
  };
}

function getTokenTdh(
  lastTDHCalc: Date,
  id: number,
  hodlRate: number,
  wallet: string,
  consolidations: string[],
  tokenConsolidatedTransactions: Transaction[]
): TokenTDH | null {
  const tokenDatesForWallet = getTokenDatesFromConsolidation(
    wallet,
    consolidations,
    tokenConsolidatedTransactions
  );

  let tdh__raw = 0;
  tokenDatesForWallet.forEach((e) => {
    const daysDiff = getDaysDiff(lastTDHCalc, e);
    if (daysDiff > 0) {
      tdh__raw += daysDiff;
    }
  });

  const balance = tokenDatesForWallet.length;

  hodlRate = Math.round(hodlRate * 100) / 100;
  const tdh = Math.round(tdh__raw * hodlRate);

  if (tdh > 0 || balance > 0) {
    const tokenTDH: TokenTDH = {
      id: id,
      balance: balance,
      hodl_rate: hodlRate,
      tdh: tdh,
      tdh__raw: tdh__raw,
    };
    return tokenTDH;
  }
  return null;
}

function getTokenDatesFromConsolidation(
  currentWallet: string,
  consolidations: string[],
  consolidationTransactions: Transaction[]
) {
  const tokenDatesMap: { [wallet: string]: Date[] } = {};

  function addDates(wallet: string, dates: Date[]) {
    if (!tokenDatesMap[wallet]) {
      tokenDatesMap[wallet] = [];
    }
    tokenDatesMap[wallet].push(...dates);
  }

  function removeDates(wallet: string, count: number) {
    if (!tokenDatesMap[wallet]) {
      console.log(
        "hi i am wallet",
        wallet,
        tokenDatesMap,
        consolidationTransactions
      );
    }
    const removeDates = tokenDatesMap[wallet].splice(
      tokenDatesMap[wallet].length - count,
      count
    );
    return removeDates;
  }

  consolidationTransactions.sort((a, b) => {
    const dateComparison = a.transaction_date - b.transaction_date;

    if (dateComparison !== 0) {
      return dateComparison;
    }

    const aInConsolidations = Number(
      consolidations.some(
        (c) =>
          !areEqualAddresses(c, currentWallet) &&
          areEqualAddresses(c, a.from_address)
      )
    );

    const bInConsolidations = Number(
      consolidations.some(
        (c) =>
          !areEqualAddresses(c, currentWallet) &&
          areEqualAddresses(c, b.from_address)
      )
    );

    if (aInConsolidations || bInConsolidations) {
      return bInConsolidations - aInConsolidations;
    }

    if (areEqualAddresses(a.to_address, currentWallet)) {
      return -1;
    }
    if (areEqualAddresses(b.to_address, currentWallet)) {
      return 1;
    }

    return 0;
  });

  for (const transaction of consolidationTransactions) {
    const { from_address, to_address, token_count, transaction_date } =
      transaction;

    const trDate = new Date(transaction_date * 1000);

    // inward
    if (consolidations.some((c) => areEqualAddresses(c, to_address))) {
      if (!consolidations.some((c) => areEqualAddresses(c, from_address))) {
        addDates(
          to_address,
          Array.from({ length: token_count }, () => trDate)
        );
      } else {
        const removedDates = removeDates(from_address, token_count);
        addDates(to_address, removedDates);
      }
    }

    // outward
    else if (consolidations.some((c) => areEqualAddresses(c, from_address))) {
      removeDates(from_address, token_count);
    }
  }

  return tokenDatesMap[currentWallet] || [];
}

export async function calculateBoosts(
  seasons: MemesSeason[],
  walletsTDH: any[]
) {
  const boostedTDH: any[] = [];

  await Promise.all(
    walletsTDH.map(async (w) => {
      const boostBreakdown = calculateBoost(
        seasons,
        w.memes_cards_sets,
        {
          genesis: w.genesis,
          nakamoto: w.nakamoto,
        },
        w.memes,
        w.gradients
      );

      const boost = boostBreakdown.total;

      const boostedMemesTdh = w.memes.reduce(
        (sum: number, m: TokenTDH) => sum + Math.round(m.tdh * boost),
        0
      );
      const boostedGradientsTdh = w.gradients.reduce(
        (sum: number, g: any) => sum + Math.round(g.tdh * boost),
        0
      );
      const boostedNextgenTdh = w.nextgen.reduce(
        (sum: number, n: any) => sum + Math.round(n.tdh * boost),
        0
      );

      const boostedTdh =
        Math.round(boostedMemesTdh) +
        Math.round(boostedGradientsTdh) +
        Math.round(boostedNextgenTdh);

      w.boost = boost;
      w.boost_breakdown = boostBreakdown.breakdown;
      w.boosted_tdh = boostedTdh;
      w.boosted_memes_tdh = boostedMemesTdh;
      w.boosted_gradients_tdh = boostedGradientsTdh;
      w.boosted_nextgen_tdh = boostedNextgenTdh;

      boostedTDH.push(w);
    })
  );

  return boostedTDH;
}

export async function calculateRanks(
  allGradientsTDH: any[],
  allNextgenTDH: any[],
  boostedTDH: any[],
  ADJUSTED_NFTS: any[]
) {
  allGradientsTDH.sort((a, b) => b.tdh - a.tdh || a.id - b.id || -1);
  const rankedGradientsTdh = allGradientsTDH.map((a, index) => {
    a.rank = index + 1;
    return a;
  });

  allNextgenTDH.sort((a, b) => b.tdh - a.tdh || a.id - b.id || -1);
  const rankedNextgenTdh = allNextgenTDH.map((a, index) => {
    a.rank = index + 1;
    return a;
  });

  ADJUSTED_NFTS.forEach((nft) => {
    boostedTDH
      .filter(
        (w) =>
          (areEqualAddresses(nft.contract, MEMES_CONTRACT) &&
            w.memes.some((m: any) => m.id == nft.id)) ||
          (areEqualAddresses(nft.contract, GRADIENT_CONTRACT) &&
            w.gradients_tdh > 0)
      )
      .sort((a, b) => {
        const aNftBalance = areEqualAddresses(nft.contract, MEMES_CONTRACT)
          ? a.memes.find((m: any) => m.id == nft.id).tdh
          : a.gradients_tdh;
        const bNftBalance = areEqualAddresses(nft.contract, MEMES_CONTRACT)
          ? b.memes.find((m: any) => m.id == nft.id).tdh
          : b.gradients_tdh;

        if (aNftBalance > bNftBalance) {
          return -1;
        } else if (aNftBalance < bNftBalance) {
          return 1;
        } else {
          if (a.boosted_tdh > b.boosted_tdh) {
            return -1;
          }
          return 1;
        }
      })
      .forEach((w, index) => {
        if (areEqualAddresses(nft.contract, MEMES_CONTRACT)) {
          w.memes_ranks.push({
            id: nft.id,
            rank: index + 1,
          });
          return w;
        }
        if (areEqualAddresses(nft.contract, GRADIENT_CONTRACT)) {
          const gradient = w.gradients.find((g: any) => g.id == nft.id);
          if (gradient) {
            w.gradients_ranks.push({
              id: nft.id,
              rank: rankedGradientsTdh.find((s) => s.id == nft.id)?.rank,
            });
          }
          return w;
        }
        if (areEqualAddresses(nft.contract, NEXTGEN_CONTRACT)) {
          const nextgen = w.nextgen.find((g: any) => g.id == nft.id);
          if (nextgen) {
            w.nextgen_ranks.push({
              id: nft.id,
              rank: rankedNextgenTdh.find((s) => s.id == nft.id)?.rank,
            });
          }
          return w;
        }
      });

    if (areEqualAddresses(nft.contract, MEMES_CONTRACT)) {
      const wallets = [...boostedTDH].filter((w) =>
        w.memes.some((m: any) => m.id == nft.id)
      );

      wallets.sort((a, b) => {
        const aNftBalance = a.memes.find((m: any) => m.id == nft.id).tdh;
        const bNftBalance = b.memes.find((m: any) => m.id == nft.id).tdh;

        if (aNftBalance > bNftBalance) {
          return -1;
        }
        if (aNftBalance > bNftBalance) {
          return -1;
        } else if (aNftBalance < bNftBalance) {
          return 1;
        } else {
          if (a.boosted_tdh > b.boosted_tdh) {
            return -1;
          }
          return 1;
        }
      });
    }
  });

  boostedTDH.sort((a: TDH, b: TDH) => {
    if (a.boosted_tdh > b.boosted_tdh) return -1;
    else if (a.boosted_tdh < b.boosted_tdh) return 1;
    else if (a.tdh > b.tdh) return -1;
    else if (a.tdh < b.tdh) return 1;
    else if (a.gradients_tdh > b.gradients_tdh) return -1;
    else if (a.gradients_tdh < b.gradients_tdh) return 1;
    else if (a.nextgen_tdh > b.nextgen_tdh) return -1;
    else if (a.nextgen_tdh < b.nextgen_tdh) return 1;
    else return -1;
  });
  boostedTDH = boostedTDH.map((w, index) => {
    w.tdh_rank = index + 1;
    return w;
  });

  boostedTDH.sort((a: TDH, b: TDH) => {
    if (a.boosted_memes_tdh > b.boosted_memes_tdh) return -1;
    else if (a.boosted_memes_tdh < b.boosted_memes_tdh) return 1;
    else if (a.memes_tdh > b.memes_tdh) return -1;
    else if (a.memes_tdh < b.memes_tdh) return 1;
    else if (a.memes_balance > b.memes_balance) return -1;
    else if (a.memes_balance < b.memes_balance) return 1;
    else if (a.balance > b.balance) return -1;
    else return -1;
  });
  boostedTDH = boostedTDH.map((w, index) => {
    if (w.boosted_memes_tdh > 0) {
      w.tdh_rank_memes = index + 1;
    } else {
      w.tdh_rank_memes = -1;
    }
    return w;
  });

  boostedTDH.sort((a: TDH, b: TDH) => {
    if (a.boosted_gradients_tdh > b.boosted_gradients_tdh) return -1;
    else if (a.boosted_gradients_tdh < b.boosted_gradients_tdh) return 1;
    else if (a.gradients_tdh > b.gradients_tdh) return -1;
    else if (a.gradients_tdh < b.gradients_tdh) return 1;
    else if (a.gradients_balance > b.gradients_balance) return -1;
    else if (a.gradients_balance < b.gradients_balance) return 1;
    else if (a.balance > b.balance) return -1;
    else return -1;
  });
  boostedTDH = boostedTDH.map((w, index) => {
    if (w.boosted_gradients_tdh > 0) {
      w.tdh_rank_gradients = index + 1;
    } else {
      w.tdh_rank_gradients = -1;
    }
    return w;
  });

  boostedTDH.sort((a: TDH, b: TDH) => {
    if (a.boosted_nextgen_tdh > b.boosted_nextgen_tdh) return -1;
    else if (a.boosted_nextgen_tdh < b.boosted_nextgen_tdh) return 1;
    else if (a.nextgen_tdh > b.nextgen_tdh) return -1;
    else if (a.nextgen_tdh < b.nextgen_tdh) return 1;
    else if (a.nextgen_balance > b.nextgen_balance) return -1;
    else if (a.nextgen_balance < b.nextgen_balance) return 1;
    else if (a.balance > b.balance) return -1;
    else return -1;
  });
  boostedTDH = boostedTDH.map((w, index) => {
    if (w.boosted_nextgen_tdh > 0) {
      w.tdh_rank_nextgen = index + 1;
    } else {
      w.tdh_rank_nextgen = -1;
    }
    return w;
  });

  return boostedTDH;
}

export function getGenesisAndNaka(memes: TokenTDH[]) {
  const gen1 = memes.find((a) => a.id == 1 && a.balance > 0)?.balance ?? 0;
  const gen2 = memes.find((a) => a.id == 2 && a.balance > 0)?.balance ?? 0;
  const gen3 = memes.find((a) => a.id == 3 && a.balance > 0)?.balance ?? 0;
  const naka = memes.find((a) => a.id == 4 && a.balance > 0)?.balance ?? 0;
  const genesis = Math.min(gen1, gen2, gen3);

  return {
    genesis,
    naka,
  };
}

export async function findLatestBlockBeforeTimestamp(
  provider: ethers.JsonRpcProvider,
  targetTimestamp: number
) {
  logInfo(parentPort, "Finding latest block before timestamp", targetTimestamp);
  const averageBlockTime = 12; // Approximate average block time in seconds
  const latestBlock = await provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Latest block not found");
  }

  let startBlock = Math.max(
    0,
    latestBlock.number -
      Math.floor((latestBlock.timestamp - targetTimestamp) / averageBlockTime)
  );
  let endBlock = latestBlock.number;

  // Perform a binary search
  while (startBlock <= endBlock) {
    const midBlockNumber = Math.floor((startBlock + endBlock) / 2);
    const midBlock = await provider.getBlock(midBlockNumber);
    if (!midBlock) {
      throw new Error("Mid block not found");
    }
    if (midBlock.timestamp === targetTimestamp) {
      // Exact match
      return midBlock;
    } else if (midBlock.timestamp < targetTimestamp) {
      // Move search to more recent blocks
      startBlock = midBlockNumber + 1;
    } else {
      // Move search to older blocks
      endBlock = midBlockNumber - 1;
    }
  }

  // `endBlock` is the latest block with a timestamp before the target
  const blockBefore = await provider.getBlock(endBlock);
  if (!blockBefore) {
    throw new Error("Block before not found");
  }
  return blockBefore;
}
