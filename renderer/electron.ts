import { GET_CUSTOM_WALLET } from "../constants";

export async function getCustomWallet() {
  const data = await window.api.sendSync(GET_CUSTOM_WALLET);
  return data;
}
