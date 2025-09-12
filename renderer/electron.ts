import { ISeedWallet } from "@/shared/types";
import {
  ADD_RPC_PROVIDER,
  ADD_SEED_WALLET,
  DEACTIVATE_RPC_PROVIDER,
  DELETE_RPC_PROVIDER,
  DELETE_SEED_WALLET,
  GET_SEED_WALLET,
  GET_SEED_WALLETS,
  IMPORT_SEED_WALLET,
  MANUAL_START_WORKER,
  RECALCULATE_TRANSACTIONS_OWNERS,
  RESET_TRANSACTIONS_TO_BLOCK,
  RESET_WORKER,
  SET_RPC_PROVIDER_ACTIVE,
  STOP_WORKER,
} from "../electron-constants";

export async function getSeedWallets(): Promise<{
  error: boolean;
  data: ISeedWallet[];
}> {
  if (typeof window === "undefined") return { error: true, data: [] };
  const data = await window.api.sendSync(GET_SEED_WALLETS);
  return data;
}

export async function getSeedWallet(address: string) {
  const data = await window.api.sendSync(GET_SEED_WALLET, address);
  return data;
}

export async function createSeedWallet(name: string, password: string) {
  const data = await window.api.sendSync(ADD_SEED_WALLET, name, password);
  return data;
}

export async function importSeedWallet(
  name: string,
  pass: string,
  address: string,
  mnemonic: string,
  privateKey: string
) {
  const data = await window.api.sendSync(
    IMPORT_SEED_WALLET,
    name,
    pass,
    address,
    mnemonic,
    privateKey
  );
  return data;
}

export async function deleteSeedWallet(address: string) {
  const data = await window.api.sendSync(DELETE_SEED_WALLET, address);
  return data;
}

export async function addRpcProvider(name: string, url: string) {
  const data = await window.api.sendSync(ADD_RPC_PROVIDER, name, url);
  return data;
}

export async function setRpcProviderActive(id: number) {
  const data = await window.api.sendSync(SET_RPC_PROVIDER_ACTIVE, id);
  return data;
}

export async function deleteRpcProvider(id: number) {
  const data = await window.api.sendSync(DELETE_RPC_PROVIDER, id);
  return data;
}

export async function deactivateRpcProvider(id: number) {
  const data = await window.api.sendSync(DEACTIVATE_RPC_PROVIDER, id);
  return data;
}

export async function manualStartWorker(namespace: string) {
  const data = await window.api.sendSync(MANUAL_START_WORKER, namespace);
  return data;
}

export async function stopWorker(namespace: string) {
  const data = await window.api.sendSync(STOP_WORKER, namespace);
  return data;
}

export async function resetTransactionsToBlock(
  namespace: string,
  block: number
) {
  const data = await window.api.sendSync(
    RESET_TRANSACTIONS_TO_BLOCK,
    namespace,
    block
  );
  return data;
}

export async function recalculateTransactionsOwners() {
  const data = await window.api.sendSync(RECALCULATE_TRANSACTIONS_OWNERS);
  return data;
}

export async function resetWorker(namespace: string) {
  const data = await window.api.sendSync(RESET_WORKER, namespace);
  return data;
}
