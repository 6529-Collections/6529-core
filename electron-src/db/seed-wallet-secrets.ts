import { MNEMONIC_NA } from "../../electron-constants";
import { encryptData } from "../../shared/encrypt";

export interface SeedWalletSecrets {
  address_hashed: string;
  mnemonic: string;
  private_key: string;
}

/**
 * Encrypts a new seed wallet's secrets in the v2 envelope. Each field gets
 * its own random salt and IV. Existing wallet rows are never passed through
 * here; they keep the format they were written in.
 */
export async function encryptSeedWalletSecrets(
  address: string,
  mnemonic: string,
  privateKey: string,
  pass: string
): Promise<SeedWalletSecrets> {
  const [addressHashed, encryptedMnemonic, encryptedPrivateKey] =
    await Promise.all([
      encryptData(address, pass),
      mnemonic === MNEMONIC_NA ? mnemonic : encryptData(mnemonic, pass),
      encryptData(privateKey, pass),
    ]);

  return {
    address_hashed: addressHashed,
    mnemonic: encryptedMnemonic,
    private_key: encryptedPrivateKey,
  };
}
