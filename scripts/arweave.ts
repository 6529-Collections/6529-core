import Arweave from "arweave";

require("dotenv").config();

let arweaveAndKey: { arweave: Arweave; key: any } | null = null;

function ensureKeyIntegrity(key: any) {
  // Fail fast if the JWK is malformed/rotated without private parts
  for (const part of ["n", "e", "d", "p", "q", "dp", "dq", "qi"]) {
    if (!key || !key[part]) {
      throw new Error(`ARWEAVE_KEY missing "${part}"`);
    }
  }
}

export function getArweaveInstance(): { arweave: Arweave; key: any } {
  if (!arweaveAndKey) {
    if (!process.env.ARWEAVE_KEY) {
      throw new Error("ARWEAVE_KEY not set");
    }
    const key = JSON.parse(process.env.ARWEAVE_KEY);
    ensureKeyIntegrity(key);

    const arweave = Arweave.init({
      host: "arweave.net",
      port: 443,
      protocol: "https",
      timeout: 60_000,
    });

    arweaveAndKey = { arweave, key };
  }
  return arweaveAndKey;
}

async function withRetries<T>(
  fn: () => Promise<T>,
  tries = 5,
  baseMs = 300
): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, baseMs * (i + 1)));
    }
  }
  throw lastErr;
}

export class ArweaveFileUploader {
  constructor(
    private readonly arweaveAndKeySupplier: () => { arweave: Arweave; key: any }
  ) {}

  public async uploadFile(
    name: string,
    fileBuffer: Buffer,
    contentType: string
  ): Promise<{ url: string }> {
    const { arweave, key } = this.arweaveAndKeySupplier();
    console.log("Arweave Uploading", name, fileBuffer.length);

    // Create tx with the exact bytes you intend to upload
    const tx = await arweave.createTransaction({ data: fileBuffer });

    // Tags BEFORE signing
    tx.addTag("Content-Type", contentType);

    // Get anchor and price explicitly (avoid implicit mutations inside SDK)
    const lastTx = await withRetries(() =>
      arweave.transactions.getTransactionAnchor()
    );
    const reward = await withRetries(() =>
      arweave.transactions.getPrice(fileBuffer.length).then((n) => n.toString())
    );

    // Override readonly TS fields via Object.assign (runtime is writable)
    Object.assign(tx, { last_tx: lastTx, reward });

    // Sign ONCE; do not mutate tx after this
    await arweave.transactions.sign(tx, key);

    // Upload chunks based on the signed tx
    const uploader = await arweave.transactions.getUploader(tx);

    let lastLoggedPercent = -1;
    while (!uploader.isComplete) {
      await uploader.uploadChunk();

      const pct = Math.floor(uploader.pctComplete);
      if (pct > lastLoggedPercent) {
        lastLoggedPercent = pct;
        console.info(
          `Arweave upload ${tx.id} ${uploader.pctComplete}% ` +
            `(${uploader.uploadedChunks}/${uploader.totalChunks})`
        );
      }
    }

    const url = `https://arweave.net/${tx.id}`;
    return { url };
  }
}

export const arweaveFileUploader = new ArweaveFileUploader(getArweaveInstance);
