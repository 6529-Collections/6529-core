// Tests the update path from an installed or unpacked older build to a new
// one, through the older build's own updater (desktop slimming plan §6):
// which file the feed hands it, whether the download is differential, that
// the checksum and signature checks pass, and optionally that the installer
// then installs silently.
//
//   pnpm exec tsx e2e/desktop/update-path.ts --from-dir <older unpacked app> \
//     (--feed-dir <folder with latest.yml and installers> | --feed-url <https feed>) \
//     [--no-signature-check] [--install <scratch install dir>] [--out <dir>]
//
// The older app's resources/app-update.yml is pointed at the test feed for
// the run and restored afterwards; downloads go to a separate updater cache
// folder. The app is never relaunched by the installer, so the real profile is
// never used. --install refuses to run while any other installation of the
// same product is registered, because the installer would replace it.

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { AppSession, freePort, ProtocolHandlerGuard, scratchDir, waitFor } from "./lib/app";
import { readPackagedFile } from "./checks/pages";

const E2E_CACHE_DIR = "6529-core-e2e-updater";

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[argv[i].slice(2)] = next;
      i++;
    } else {
      args[argv[i].slice(2)] = true;
    }
  }
  return args;
}

interface ServedStats {
  requests: Array<{ path: string; range: string | null; bytes: number }>;
}

/** A static feed server with single and multiple byte ranges, as electron-updater uses. */
function serveFeed(dir: string, port: number, stats: ServedStats): Promise<http.Server> {
  const root = path.resolve(dir);
  const server = http.createServer((request, response) => {
    let name: string;
    try {
      name = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname).replace(/^\/+/, "");
    } catch {
      response.writeHead(400).end();
      return;
    }
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const size = fs.statSync(file).size;
    const rangeHeader = request.headers.range ?? null;
    const record = (bytes: number) => stats.requests.push({ path: name, range: rangeHeader, bytes });
    if (!rangeHeader) {
      response.writeHead(200, { "Content-Length": size, "Accept-Ranges": "bytes" });
      fs.createReadStream(file).pipe(response);
      record(size);
      return;
    }
    const ranges = rangeHeader
      .replace(/^bytes=/, "")
      .split(",")
      .map((part) => part.trim().split("-").map(Number) as [number, number])
      .map(([start, end]) => [start, Number.isFinite(end) ? Math.min(end, size - 1) : size - 1] as [number, number]);
    if (ranges.length === 1) {
      const [start, end] = ranges[0];
      response.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(file, { start, end }).pipe(response);
      record(end - start + 1);
      return;
    }
    const boundary = `suite${Date.now()}`;
    const fd = fs.openSync(file, "r");
    const parts: Buffer[] = [];
    let bytes = 0;
    for (const [start, end] of ranges) {
      const chunk = Buffer.alloc(end - start + 1);
      fs.readSync(fd, chunk, 0, chunk.length, start);
      parts.push(
        Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${start}-${end}/${size}\r\n\r\n`),
        chunk,
        Buffer.from("\r\n"),
      );
      bytes += chunk.length;
    }
    fs.closeSync(fd);
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    response.writeHead(206, { "Content-Type": `multipart/byteranges; boundary=${boundary}`, "Content-Length": body.length });
    response.end(body);
    record(bytes);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

function findExe(dir: string): string {
  const exe = fs.readdirSync(dir).find((name) => /^6529 Desktop.*\.exe$/.test(name) && !/uninstall/i.test(name));
  if (!exe) throw new Error(`no app executable in ${dir}`);
  return path.join(dir, exe);
}

/**
 * Install folders of every registered Windows installation of this product.
 * The NSIS installer runs the registered uninstaller before installing, even
 * with /D=, so --install must only ever meet the disposable test install.
 */
function registeredInstallFolders(productName: string): string[] {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$keys = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
    "@(Get-ItemProperty $keys | Where-Object { $_.DisplayName } | ForEach-Object { [pscustomobject]@{ name = $_.DisplayName; location = $_.InstallLocation; icon = $_.DisplayIcon; uninstall = $_.UninstallString } }) | ConvertTo-Json -Compress",
  ].join("; ");
  const run = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true });
  if (run.status !== 0) throw new Error(`could not read registered installations: ${run.stderr}`);
  const parsed = JSON.parse(run.stdout.trim() || "[]");
  type Entry = { name: string; location: string | null; icon: string | null; uninstall: string | null };
  const entries: Entry[] = Array.isArray(parsed) ? parsed : [parsed];
  const sameProduct = new RegExp(`^${productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( \\d+\\.\\d+\\.\\d+\\S*)?$`);
  // electron-builder leaves InstallLocation empty in the uninstall entry; the
  // icon and uninstaller paths name the folder.
  const folderOf = (entry: Entry) => {
    if (entry.location) return entry.location;
    const file = entry.icon?.replace(/,-?\d+$/, "") ?? entry.uninstall?.match(/^"([^"]+)"/)?.[1];
    return file ? path.dirname(file) : "(no install folder)";
  };
  return entries.filter((entry) => sameProduct.test(entry.name)).map(folderOf);
}

const samePath = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const fromDir = path.resolve(String(args["from-dir"] ?? ""));
  if (!fs.existsSync(path.join(fromDir, "resources", "app-update.yml"))) {
    console.error("--from-dir must be an unpacked or installed older app with resources/app-update.yml");
    return 2;
  }
  const outDir = path.resolve(typeof args.out === "string" ? args.out : scratchDir("6529-update-out-"));
  fs.mkdirSync(outDir, { recursive: true });
  const work = scratchDir("6529-update-");
  const exe = findExe(fromDir);
  const fromVersion = JSON.parse((await readPackagedFile(exe, "package.json")) ?? "{}").version;
  const publicRuntime = JSON.parse((await readPackagedFile(exe, "main/config/__PUBLIC_RUNTIME.json")) ?? "{}");

  const stats: ServedStats = { requests: [] };
  let server: http.Server | null = null;
  let feedUrl: string;
  if (typeof args["feed-dir"] === "string") {
    const port = await freePort();
    server = await serveFeed(path.resolve(args["feed-dir"]), port, stats);
    feedUrl = `http://127.0.0.1:${port}/`;
  } else if (typeof args["feed-url"] === "string") {
    feedUrl = args["feed-url"].endsWith("/") ? args["feed-url"] : `${args["feed-url"]}/`;
  } else {
    console.error("--feed-dir or --feed-url is required");
    return 2;
  }

  const installDir = typeof args.install === "string" ? path.resolve(args.install) : null;
  if (installDir && process.platform === "win32") {
    const others = registeredInstallFolders(path.basename(exe, ".exe")).filter(
      (folder) => !samePath(folder, fromDir) && !samePath(folder, installDir),
    );
    if (others.length > 0) {
      console.error(`--install refused: the installer would replace the registered installation in ${others.join(", ")}`);
      server?.close();
      return 2;
    }
  }

  const updateYml = path.join(fromDir, "resources", "app-update.yml");
  // Kept until the run ends; a run killed outright leaves it behind, and the
  // next run starts from it instead of from the test configuration.
  const backupYml = `${updateYml}.e2e-backup`;
  const originalYml = fs.readFileSync(fs.existsSync(backupYml) ? backupYml : updateYml, "utf8");
  fs.writeFileSync(backupYml, originalYml);
  const publisher = originalYml.match(/^publisherName:\s*\n((?:\s+- .*\n?)+)/m)?.[1] ?? null;
  const testYml = [
    "provider: generic",
    `url: ${feedUrl}`,
    `updaterCacheDirName: ${E2E_CACHE_DIR}`,
    ...(publisher && args["no-signature-check"] !== true ? ["publisherName:", publisher.trimEnd()] : []),
  ].join("\n");
  const cacheDir = path.join(process.env.LOCALAPPDATA ?? os.homedir(), E2E_CACHE_DIR);
  fs.rmSync(cacheDir, { recursive: true, force: true });

  const guard = new ProtocolHandlerGuard(publicRuntime.CORE_SCHEME ?? "core6529", work);
  guard.save();
  let restored = false;
  const restoreTestChanges = () => {
    if (restored) return;
    restored = true;
    fs.writeFileSync(updateYml, originalYml);
    fs.rmSync(backupYml, { force: true });
    guard.restore();
  };
  let app: AppSession | null = null;
  // finally blocks do not run when a signal or an uncaught error ends Node:
  // restore the files, stop the app and the feed server, then exit.
  const abort = (code: number) => {
    restoreTestChanges();
    server?.close();
    void Promise.resolve(app?.kill())
      .catch(() => undefined)
      .finally(() => process.exit(code));
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"] as const) {
    process.once(signal, () => abort(130));
  }
  process.once("uncaughtException", (error) => {
    console.error(error);
    abort(1);
  });
  const result: Record<string, unknown> = {
    fromVersion,
    fromDir: path.basename(fromDir),
    feed: server ? "local folder" : feedUrl,
    signatureCheck: Boolean(publisher) && args["no-signature-check"] !== true,
    arch: process.arch,
  };
  let exitCode = 1;
  try {
    fs.writeFileSync(updateYml, testYml + "\n");
    app = AppSession.launch({ exe, profileDir: path.join(work, "profile"), cdpPort: await freePort() });
    const page = await app.mainPage(240_000);
    // Only anonymous functions inside page.evaluate: tsx names local
    // functions with a helper that does not exist in the page.
    await page.evaluate(() => {
      const state = ((window as any).__suiteUpdate = { events: [] as any[] });
      const updater = (window as any).updater;
      for (const [event, method] of [
        ["available", "onUpdateAvailable"],
        ["not-available", "onUpdateNotAvailable"],
        ["error", "onUpdateError"],
        ["progress", "onUpdateProgress"],
        ["downloaded", "onUpdateDownloaded"],
      ]) {
        updater[method]((_e: unknown, detail: any) =>
          state.events.push({
            event,
            detail: detail && typeof detail === "object" ? JSON.parse(JSON.stringify(detail)) : String(detail),
          }),
        );
      }
      updater.checkUpdates();
    });
    const readEvents = () => page.evaluate(() => (window as any).__suiteUpdate.events as any[]);
    const answer = await waitFor(
      "an update answer",
      async () => (await readEvents()).find((entry) => ["available", "not-available", "error"].includes(entry.event)),
      120_000,
      500,
    );
    result.check = answer.event;
    result.toVersion = answer.detail?.version;
    if (answer.event !== "available") throw new Error(`update check: ${answer.event} ${JSON.stringify(answer.detail).slice(0, 300)}`);
    const startedDownload = Date.now();
    await page.evaluate(() => (window as any).updater.downloadUpdate());
    const done = await waitFor(
      "the download to finish",
      async () => (await readEvents()).find((entry) => entry.event === "downloaded" || entry.event === "error"),
      60 * 60_000,
      1000,
    );
    result.download = done.event;
    result.downloadSeconds = Math.round((Date.now() - startedDownload) / 1000);
    const log = app.readMainLog().map((line) => line.text);
    result.differential = log.some((text) => /Download block maps|differential/i.test(text))
      ? log.some((text) => /Cannot download differentially|fallback to full download/i.test(text))
        ? "attempted, fell back to full download"
        : "differential"
      : "full";
    result.updaterLog = log.filter((text) => /update|download|block ?map|signature|sha512/i.test(text)).slice(-25).map((text) => text.split("\n")[0].slice(0, 240));
    if (server) {
      result.servedBytes = stats.requests.reduce((sum, entry) => sum + entry.bytes, 0);
      result.servedFiles = [...new Set(stats.requests.map((entry) => entry.path))];
    }
    if (done.event !== "downloaded") throw new Error(`download: ${JSON.stringify(done.detail).slice(0, 400)}`);

    const pending = path.join(cacheDir, "pending");
    const installer = fs.existsSync(pending) ? fs.readdirSync(pending).find((name) => name.endsWith(".exe")) : undefined;
    result.downloadedInstaller = installer ?? null;
    if (installDir) {
      if (!installer) throw new Error("no downloaded installer to run");
      await app.kill();
      app = null;
      // Silent, and without --force-run, so the installer never starts the
      // app with the default profile.
      const run = spawnSync(path.join(pending, installer), ["/S", "--updated", `/D=${installDir}`], {
        windowsHide: true,
        timeout: 30 * 60_000,
      });
      result.installExit = run.status;
      const installedExe = findExe(installDir);
      const installedVersion = JSON.parse((await readPackagedFile(installedExe, "package.json")) ?? "{}").version;
      result.installedVersion = installedVersion;
      if (run.status !== 0 || installedVersion !== result.toVersion) {
        throw new Error(`install: exit ${run.status}, installed ${installedVersion}`);
      }
    }
    exitCode = 0;
  } catch (error) {
    result.failure = String(error instanceof Error ? error.message : error).slice(0, 800);
  } finally {
    if (app) await app.kill();
    restoreTestChanges();
    server?.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(outDir, "update-path.json"), JSON.stringify(result, null, 1) + "\n");
  console.log(JSON.stringify(result, null, 1));
  return exitCode;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
