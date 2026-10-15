// Desktop-only functions driven through the app's own preload bridge: the
// same IPC surface the renderer uses, so a narrowed preload or a moved main
// process has to keep these working.

import { ethers } from "ethers";
import {
  ADD_RPC_PROVIDER,
  ADD_SEED_WALLET,
  DEACTIVATE_RPC_PROVIDER,
  DELETE_RPC_PROVIDER,
  DELETE_SEED_WALLET,
  FULL_REFRESH_WORKER,
  GET_SEED_WALLET,
  GET_SEED_WALLETS,
  IMPORT_SEED_WALLET,
  MANUAL_START_WORKER,
  RECALCULATE_TRANSACTIONS_OWNERS,
  RECONCILE_TRANSACTIONS,
  RESET_WORKER,
  SET_RPC_PROVIDER_ACTIVE,
  STOP_WORKER,
} from "../../../electron-constants";
import { decryptData, getEncryptionVersion } from "../../../shared/encrypt";
import { waitFor } from "../lib/app";
import { assert, skip } from "../lib/report";
import { apiGet, bridge, invoke, sendSync, type SuiteContext } from "./context";
import { expectRendered } from "./pages";

// Hardhat's published test account; never holds value.
const TEST_MNEMONIC = "test test test test test test test test test test test junk";
const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const WALLET_PASSWORD = "function-suite-password-1";
// The discard port: connections are refused at once, so the workers start,
// fail fast and touch no real chain.
const DUMMY_RPC_URL = "http://127.0.0.1:9/";

export async function runDesktopChecks(ctx: SuiteContext): Promise<void> {
  const { recorder: r, page } = ctx;

  // F2 desktop-only pages
  await r.check("F2", "core-info", "Core info page shows the app and IPFS ports", async () => {
    const text = await expectRendered(ctx, "/core/core-info");
    assert(/App Port/i.test(text), "no App Port on /core/core-info");
    return text.match(/v\d+\.\d+\.\d+/)?.[0];
  });
  for (const route of ["/core/core-wallets", "/core/eth-transactions", "/core/tdh-calculation"]) {
    await r.check("F2", `page${route}`, `${route} renders`, async () => {
      await expectRendered(ctx, route);
    });
  }

  // F3 seed wallets
  let createdAddress: string | undefined;
  await r.check("F3", "wallet-create", "Create a seed wallet; secrets stored in the v2 envelope", async () => {
    const created = await sendSync(page, ADD_SEED_WALLET, "Function suite wallet", WALLET_PASSWORD);
    assert(!created.error && ethers.isAddress(created.data), `create failed: ${JSON.stringify(created.data)}`);
    createdAddress = created.data as string;
    ctx.samples.seedWallet = createdAddress;
    const stored = await sendSync(page, GET_SEED_WALLET, createdAddress);
    assert(!stored.error && stored.data, "created wallet not found");
    assert(getEncryptionVersion(stored.data.private_key) === 2, "private key not in the v2 envelope");
    assert(getEncryptionVersion(stored.data.mnemonic) === 2, "mnemonic not in the v2 envelope");
    return createdAddress;
  });
  await r.check("F3", "wallet-decrypt-sign", "Decrypt the created wallet and sign a message", async () => {
    if (!createdAddress) skip("no created wallet");
    const stored = await sendSync(page, GET_SEED_WALLET, createdAddress);
    const mnemonic = await decryptData(createdAddress, stored.data.mnemonic, WALLET_PASSWORD);
    const privateKey = await decryptData(createdAddress, stored.data.private_key, WALLET_PASSWORD);
    assert(ethers.Wallet.fromPhrase(mnemonic).address === createdAddress, "mnemonic does not derive the address");
    const wallet = new ethers.Wallet(privateKey);
    assert(wallet.address === createdAddress, "private key does not match the address");
    const message = "6529 desktop function suite";
    const signature = await wallet.signMessage(message);
    assert(ethers.verifyMessage(message, signature) === createdAddress, "signature does not verify");
    let wrongPasswordRejected = false;
    try {
      await decryptData(createdAddress, stored.data.private_key, "wrong password");
    } catch {
      wrongPasswordRejected = true;
    }
    assert(wrongPasswordRejected, "a wrong password decrypted the key");
  });
  await r.check("F3", "wallet-import", "Import a wallet from a mnemonic and list it", async () => {
    const wallet = ethers.Wallet.fromPhrase(TEST_MNEMONIC);
    assert(wallet.address === TEST_ADDRESS, "test mnemonic changed");
    const imported = await sendSync(
      page,
      IMPORT_SEED_WALLET,
      "Function suite import",
      WALLET_PASSWORD,
      wallet.address,
      TEST_MNEMONIC,
      wallet.privateKey,
    );
    assert(!imported.error, `import failed: ${JSON.stringify(imported.data)}`);
    const list = await sendSync(page, GET_SEED_WALLETS);
    const row = (list.data as any[]).find((entry) => entry.address === TEST_ADDRESS);
    assert(row && row.imported === true, "imported wallet missing from the list");
    const key = await decryptData(TEST_ADDRESS, row.private_key, WALLET_PASSWORD);
    assert(new ethers.Wallet(key).address === TEST_ADDRESS, "imported key does not round-trip");
  });

  // F5 IPFS
  let ipfs: { apiEndpoint?: string; gatewayEndpoint?: string; status?: string } = {};
  await r.check("F5", "ipfs-ready", "IPFS starts and reports its endpoints", async () => {
    ipfs = await bridge(page, "api", "getIpfsInfo");
    assert(ipfs.apiEndpoint && ipfs.gatewayEndpoint, `IPFS not available: ${JSON.stringify(ipfs)}`);
    return `${ipfs.status ?? "ready"}: api ${ipfs.apiEndpoint}, gateway ${ipfs.gatewayEndpoint}`;
  });
  await r.check("F5", "ipfs-add-read", "Add a file through the API and read it through the gateway", async () => {
    if (!ipfs.apiEndpoint) skip("IPFS unavailable");
    const content = `6529 desktop function suite ${Date.now()}`;
    const form = new FormData();
    form.append("file", new Blob([content]), "suite.txt");
    const added = await fetch(`${ipfs.apiEndpoint}/api/v0/add?pin=false`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    assert(added.ok, `add: HTTP ${added.status}`);
    const { Hash } = (await added.json()) as { Hash: string };
    const read = await fetch(`${ipfs.gatewayEndpoint}/ipfs/${Hash}`, { signal: AbortSignal.timeout(30_000) });
    assert(read.ok, `gateway: HTTP ${read.status}`);
    assert((await read.text()) === content, "gateway returned different content");
    return Hash;
  });
  await r.check("F5", "ipfs-webui-window", "The IPFS WebUI opens in its own window", async () => {
    if (!ipfs.apiEndpoint) skip("IPFS unavailable");
    const webui = await fetch(`${ipfs.apiEndpoint}/webui`, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    assert(webui.status < 400, `webui: HTTP ${webui.status}`);
    await bridge(page, "api", "openExternal", `${ipfs.apiEndpoint}/webui`);
    // Playwright does not list a window whose first navigation is still
    // pending (Kubo fetches the WebUI from its peers), so read CDP's targets.
    const target = await waitFor(
      "the IPFS window",
      async () => (await ctx.app.cdpTargets()).find((entry) => entry.type === "page" && entry.url.startsWith(ipfs.apiEndpoint!)),
      20_000,
      500,
    );
    await ctx.app.closeTarget(target.id);
    return target.url;
  });

  // F6 background jobs and RPC providers
  let workers: { tasks: any[]; rpcProviders: any[] } = { tasks: [], rpcProviders: [] };
  await r.check("F6", "workers-listed", "The background jobs and RPC providers are listed", async () => {
    workers = await bridge(page, "api", "getScheduledWorkers");
    const names = workers.tasks.map((task) => task.namespace);
    assert(names.length >= 4, `expected the four jobs, got ${names.join(", ")}`);
    return names.join(", ");
  });
  let providerId: number | undefined;
  await r.check("F6", "rpc-add", "Add an RPC provider", async () => {
    const added = await sendSync(page, ADD_RPC_PROVIDER, "Function suite RPC", DUMMY_RPC_URL);
    assert(!added.error && typeof added.data === "number", `add failed: ${JSON.stringify(added.data)}`);
    providerId = added.data;
    const listed = await bridge(page, "api", "getScheduledWorkers");
    assert(listed.rpcProviders.some((provider: any) => provider.id === providerId), "new provider not listed");
  });
  await r.check("F6", "rpc-activate", "Activate the RPC provider; the jobs start", async () => {
    if (providerId === undefined) skip("no provider");
    const activated = await sendSync(page, SET_RPC_PROVIDER_ACTIVE, providerId);
    assert(!activated.error, `activate failed: ${JSON.stringify(activated.data)}`);
    const listed = await bridge(page, "api", "getScheduledWorkers");
    const active = listed.rpcProviders.find((provider: any) => provider.active);
    assert(active?.id === providerId, `active provider is ${active?.id ?? "none"}`);
    return listed.tasks.map((task: any) => `${task.namespace}:${task.status?.status ?? task.status}`).join(", ");
  });
  const firstJob = () => workers.tasks[0]?.namespace as string | undefined;
  const resettableJob = () => workers.tasks.find((task) => task.resetable)?.namespace as string | undefined;
  await r.check("F6", "worker-start", "Start a job by hand", async () => {
    const namespace = firstJob();
    if (!namespace) skip("no jobs");
    const result = await sendSync(page, MANUAL_START_WORKER, namespace);
    return `${namespace}: ${result.error ? "refused" : "started"} (${result.data})`;
  });
  await r.check("F6", "worker-stop", "Stop a job", async () => {
    const namespace = firstJob();
    if (!namespace) skip("no jobs");
    const result = await sendSync(page, STOP_WORKER, namespace);
    return `${namespace}: ${JSON.stringify(result)}`;
  });
  // A running job refuses reset and full refresh, so stop it first.
  const stopAndWait = async (namespace: string) => {
    await sendSync(page, STOP_WORKER, namespace);
    await waitFor(
      `${namespace} to stop`,
      async () => {
        const listed = await bridge(page, "api", "getScheduledWorkers");
        const task = listed.tasks.find((entry: any) => entry.namespace === namespace);
        return task && !/running|started/i.test(JSON.stringify(task.status));
      },
      30_000,
      500,
    ).catch(() => undefined);
  };
  await r.check("F6", "worker-reset", "Reset a resettable job", async () => {
    const namespace = resettableJob();
    if (!namespace) skip("no resettable job");
    await stopAndWait(namespace);
    const result = await sendSync(page, RESET_WORKER, namespace);
    return `${namespace}: ${JSON.stringify(result)}`;
  });
  await r.check("F6", "worker-full-refresh", "Fully refresh a resettable job", async () => {
    const namespace = resettableJob();
    if (!namespace) skip("no resettable job");
    await stopAndWait(namespace);
    const result = await invoke(page, FULL_REFRESH_WORKER, namespace);
    return `${namespace}: ${JSON.stringify(result)}`;
  });
  await r.check("F6", "owners-recalculate", "Recalculate owners", async () => {
    const result = await sendSync(page, RECALCULATE_TRANSACTIONS_OWNERS);
    return JSON.stringify(result);
  });
  await r.check("F6", "transactions-reconcile", "Reconcile refuses before transactions are synced", async () => {
    const result = await invoke(page, RECONCILE_TRANSACTIONS, 13_000_000);
    assert(result?.error === true, `expected a refusal, got ${JSON.stringify(result)}`);
    return String(result.data);
  });
  await r.check("F6", "rpc-deactivate-delete", "Deactivate and delete the RPC provider", async () => {
    if (providerId === undefined) skip("no provider");
    const deactivated = await sendSync(page, DEACTIVATE_RPC_PROVIDER, providerId);
    assert(!deactivated.error, `deactivate failed: ${JSON.stringify(deactivated.data)}`);
    const removed = await sendSync(page, DELETE_RPC_PROVIDER, providerId);
    assert(!removed.error, `delete failed: ${JSON.stringify(removed.data)}`);
    const listed = await bridge(page, "api", "getScheduledWorkers");
    assert(!listed.rpcProviders.some((provider: any) => provider.id === providerId), "provider still listed");
  });

  // F11 logs and crash dumps
  await r.check("F11", "logs-read", "Read the main log through the log viewer bridge", async () => {
    const main = await bridge(page, "api", "getMainWorker");
    const { lines } = await bridge(page, "api", "getLastLines", main.mainTask.logFile, 20);
    assert(Array.isArray(lines) && lines.length > 0, "no log lines");
  });
  await r.check("F11", "logs-window", "Open and close a log viewer window", async () => {
    const main = await bridge(page, "api", "getMainWorker");
    await bridge(page, "api", "openLogs", "6529 Desktop", main.mainTask.logFile);
    const logsPage = await waitFor(
      "the log window",
      () => ctx.app.pages().find((candidate) => candidate.url().includes("logs.html")),
      15_000,
    );
    await logsPage.close();
  });
  await r.check("F11", "crash-reports", "List local crash dumps", async () => {
    const reports = await bridge(page, "api", "getCrashReports");
    assert(Array.isArray(reports), "crash report list is not a list");
    return `${reports.length} dumps`;
  });

  // F12 sessions and connection sharing
  await r.check("F12", "native-auth", "The main-process session bridge is available", async () => {
    assert((await bridge(page, "nativeAuth", "isAvailable")) === true, "nativeAuth unavailable");
  });
  await r.check("F12", "sign-in-share", "Sign in with a seed wallet and create a connection share for a phone", async () => {
    if (ctx.backend !== "test") {
      skip("signed-in flows run only against the test backend");
    }
    const wallet = new ethers.Wallet(ethers.Wallet.fromPhrase(TEST_MNEMONIC).privateKey);
    const nonce = await apiGet(
      ctx,
      `auth/session-nonce?signer_address=${wallet.address}&client_type=desktop&chain_id=1`,
    );
    const clientSignature = await wallet.signMessage(nonce.signable_message);
    const login = await bridge(page, "nativeAuth", "sessionLogin", {
      client_type: "desktop",
      server_signature: nonce.server_signature,
      client_signature: clientSignature,
      client_address: wallet.address,
    });
    const token = login?.token ?? login?.access_token;
    assert(typeof token === "string" && token.length > 0, `no access token: ${Object.keys(login ?? {}).join(",")}`);
    assert(!login.native_refresh_token, "refresh token reached the renderer");
    const share = await bridge(page, "nativeAuth", "createConnectionShare", {
      access_token: token,
      target_client_type: "native",
      client_type: "desktop",
      client_address: wallet.address,
    });
    assert(share && Object.keys(share).length > 0, "no connection share returned");
    await bridge(page, "nativeAuth", "sessionLogout", {
      access_token: token,
      client_type: "desktop",
      client_address: wallet.address,
      all_sessions: false,
    });
    return `share fields: ${Object.keys(share).join(", ")}`;
  });
}

/** Deletes the wallets runDesktopChecks created; runs after the route pass. */
export async function runDesktopCleanup(ctx: SuiteContext): Promise<void> {
  const { recorder: r, page } = ctx;
  await r.check("F3", "wallet-delete", "Delete the suite's wallets", async () => {
    for (const address of [ctx.samples.seedWallet, TEST_ADDRESS]) {
      if (!address) continue;
      const removed = await sendSync(page, DELETE_SEED_WALLET, address);
      assert(!removed.error, `delete ${address} failed`);
    }
    const list = await sendSync(page, GET_SEED_WALLETS);
    assert(!(list.data as any[]).some((entry) => entry.address === TEST_ADDRESS), "wallet still listed");
  });
}
