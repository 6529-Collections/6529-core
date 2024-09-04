import {
  ADD_SEED_WALLET,
  DELETE_SEED_WALLET,
  GET_SEED_WALLETS,
  GET_SEED_WALLET,
  IMPORT_SEED_WALLET,
} from "../constants";

export async function getSeedWallets() {
  if (typeof window === "undefined") return;
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

export async function importSeedWallet(
  name: string,
  address: string,
  mnemonic: string,
  privateKey: string
) {
  const data = await window.api.sendSync(
    IMPORT_SEED_WALLET,
    name,
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
