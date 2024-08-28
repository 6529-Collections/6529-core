import Arweave from "arweave";

require("dotenv").config();

let arweaveAndKey: { arweave: Arweave; key: any } | null = null;

export function getArweaveInstance(): { arweave: Arweave; key: any } {
  if (!arweaveAndKey) {
    if (!process.env.ARWEAVE_KEY) {
      throw new Error("ARWEAVE_KEY not set");
    }
    const arweaveKey = JSON.parse(process.env.ARWEAVE_KEY);
    const arweave = Arweave.init({
      host: "arweave.net",
      port: 443,
      protocol: "https",
    });
    arweaveAndKey = { arweave, key: arweaveKey };
  }
  return arweaveAndKey;
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
    console.log("Arweave Uploading", name, fileBuffer.length);
    const { arweave, key: arweaveKey } = this.arweaveAndKeySupplier();
    const areweaveTransaction = await arweave.createTransaction(
      { data: fileBuffer },
      arweaveKey
    );
    areweaveTransaction.addTag("Content-Type", contentType);

    await arweave.transactions.sign(areweaveTransaction, arweaveKey);

    const uploader = await arweave.transactions.getUploader(
      areweaveTransaction
    );

    let lastLoggedPercent = 0;

    while (!uploader.isComplete) {
      await uploader.uploadChunk();
      const currentPercent = Math.floor(uploader.pctComplete);

      if (currentPercent >= lastLoggedPercent + 1) {
        // Log every 1% completion
        lastLoggedPercent = currentPercent;
        console.info(
          `Arweave upload ${areweaveTransaction.id} ${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`
        );
      }
    }
    const url = `https://arweave.net/${areweaveTransaction.id}`;
    return { url };
  }
}

export const arweaveFileUploader = new ArweaveFileUploader(getArweaveInstance);
