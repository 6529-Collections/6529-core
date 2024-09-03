import {
  ADD_SEED_WALLET,
  DELETE_SEED_WALLET,
  GET_SEED_WALLETS,
  GET_SEED_WALLET,
} from "../constants";

export async function getSeedWallets() {
  const data = await window.api.sendSync(GET_SEED_WALLETS);
  return data;
}

export async function getSeedWallet(name: string) {
  const data = await window.api.sendSync(GET_SEED_WALLET, name);
  return data;
}

export async function createSeedWallet(name: string) {
  const data = await window.api.sendSync(ADD_SEED_WALLET, name);
  return data;
}

export async function deleteSeedWallet(name: string) {
  const data = await window.api.sendSync(DELETE_SEED_WALLET, name);
  return data;
}
