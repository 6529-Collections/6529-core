import { createHash } from "node:crypto";
import fs from "node:fs";
import kubo from "../../config/kubo.json";

export const IPFS_WEBUI = kubo.webui;
export const IPFS_WEBUI_TIMEOUT_MS = 120_000;

export interface WebUiSetup {
  archivePath: string;
  runCommand(args: readonly string[], timeoutMs: number): Promise<void>;
  isCancelled(): boolean;
  log(message: string): void;
}

/** Seed the exact bundled UI offline and keep its complete DAG pinned across GC. */
export async function ensureIpfsWebUi(
  setup: WebUiSetup,
  webui = IPFS_WEBUI,
): Promise<void> {
  const checkPin = () =>
    setup.runCommand(
      ["pin", "ls", "--type=recursive", webui.cid],
      IPFS_WEBUI_TIMEOUT_MS,
    );
  try {
    await checkPin();
    return;
  } catch {
    // A fresh profile or Kubo upgrade needs this version's UI imported.
  }
  if (setup.isCancelled()) throw new Error("IPFS WebUI setup cancelled");
  const archive = fs.readFileSync(setup.archivePath);
  if (
    archive.length !== webui.size ||
    createHash("sha256").update(archive).digest("hex") !== webui.sha256
  ) {
    throw new Error("Bundled IPFS WebUI archive failed integrity verification");
  }
  setup.log(`[IPFS] Importing bundled WebUI ${webui.version}`);
  // Kubo's dag import explicitly uses an offline API: no peer/DHT fetches.
  await setup.runCommand(
    ["dag", "import", "--pin-roots=true", setup.archivePath],
    IPFS_WEBUI_TIMEOUT_MS,
  );
  if (setup.isCancelled()) throw new Error("IPFS WebUI setup cancelled");
  await checkPin();
  setup.log(`[IPFS] Bundled WebUI ${webui.version} ready`);
}
