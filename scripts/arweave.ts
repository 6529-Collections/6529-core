import Arweave from "arweave";
require("dotenv").config();

let arweaveAndKey: { arweave: Arweave; key: any } | null = null;

function ensureKeyIntegrity(key: any) {
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
    const addr = await arweave.wallets.jwkToAddress(key);
    console.log("Uploader address:", addr);
    console.log("Arweave Uploading", name, fileBuffer.length);

    // 1) Create tx with data (SDK sets reward internally)
    const tx = await withRetries(() =>
      arweave.createTransaction({ data: fileBuffer })
    );

    // 2) Add tags BEFORE signing
    tx.addTag("Content-Type", contentType);

    // 3) Sign ONCE; no mutations after this
    await withRetries(() => arweave.transactions.sign(tx, key));

    // 4) Upload via chunked uploader (SDK manages last_tx / anchors)
    const uploader = await arweave.transactions.getUploader(tx);
    let lastLogged = -1;

    while (!uploader.isComplete) {
      await withRetries(() => uploader.uploadChunk());
      const pct = Math.floor(uploader.pctComplete);
      if (pct > lastLogged) {
        lastLogged = pct;
        console.info(
          `Arweave upload ${tx.id} ${uploader.pctComplete}% (${uploader.uploadedChunks}/${uploader.totalChunks})`
        );
      }
    }

    return { url: `https://arweave.net/${tx.id}` };
  }
}

export const arweaveFileUploader = new ArweaveFileUploader(getArweaveInstance);
