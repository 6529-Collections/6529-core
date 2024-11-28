import { IpcMain } from "electron";
import { IPC_DB_CHANNELS } from "../preload-db";
import { getDb } from "./db";
import { TDHMerkleRoot, ConsolidatedTDH } from "./entities/ITDH";
import Logger from "electron-log";

async function fetchTdhInfo() {
  const tdhMerkle = await getDb().getRepository(TDHMerkleRoot).findOneBy({
    id: 1,
  });

  if (!tdhMerkle) {
    return undefined;
  }

  const totalTDH = await getDb()
    .getRepository(ConsolidatedTDH)
    .sum("boosted_tdh");

  if (!totalTDH) {
    return undefined;
  }

  Logger.info(
    `TDH INFO: [BLOCK] ${tdhMerkle.block} [ROOT] ${tdhMerkle.merkle_root} [LAST CALCULATION] ${tdhMerkle.last_update} [TOTAL TDH] ${totalTDH}`
  );

  return {
    block: tdhMerkle.block,
    blockTimestamp: tdhMerkle.timestamp,
    merkleRoot: tdhMerkle.merkle_root,
    lastCalculation: tdhMerkle.last_update,
    totalTDH,
  };
}

async function fetchTdhInfoForKey(key: string) {
  Logger.info(`Fetching TDH info for key: ${key}`);

  const addressTDH = await getDb().getRepository(ConsolidatedTDH).findOneBy({
    consolidation_key: key,
  });

  if (!addressTDH) {
    return undefined;
  }

  return addressTDH;
}

export function registerIpcHandlers(ipcMain: IpcMain) {
  ipcMain.handle(IPC_DB_CHANNELS.GET_TDH_INFO, async (_event) => {
    const tdhInfo = await fetchTdhInfo();
    return tdhInfo;
  });
  ipcMain.handle(
    IPC_DB_CHANNELS.GET_TDH_INFO_FOR_KEY,
    async (_event, key: string) => {
      const tdhInfo = await fetchTdhInfoForKey(key);
      return tdhInfo;
    }
  );
}
