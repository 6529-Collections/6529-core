import { spawn } from "node:child_process";
import { accessSync, constants, lstatSync } from "node:fs";
import path from "node:path";
import classicDesktop from "../config/classic-desktop.json";

const skipMoveArg = "--skip-classic-mac-bundle-move";

export function classicMacBundleMove(environment: string, executable: string) {
  if (environment !== "production" && environment !== "staging") return;
  const name = classicDesktop.displayName + (environment === "staging" ? " Staging" : "");
  const legacyName = name.replace(" Classic", "");
  const contents = path.dirname(path.dirname(executable));
  const source = path.dirname(contents);
  if (
    !path.isAbsolute(executable) ||
    path.basename(source) !== `${legacyName}.app` ||
    executable !== path.join(source, "Contents", "MacOS", legacyName)
  ) {
    return;
  }

  return {
    source,
    destination: path.join(path.dirname(source), `${name}.app`),
    helper: path.join(contents, "Helpers", "classic-bundle-move"),
  };
}

export async function startClassicMacBundleMove(environment: string) {
  if (process.argv.includes(skipMoveArg)) return;
  const move = classicMacBundleMove(environment, process.execPath);
  if (!move) return;

  const source = lstatSync(move.source, { bigint: true });
  if (!source.isDirectory() || lstatSync(move.destination, { throwIfNoEntry: false })) {
    return;
  }
  accessSync(path.dirname(move.source), constants.W_OK);

  // ShipIt has relaunched at the legacy path. The signed helper keeps running
  // after this process exits, when changing the bundle path is safe.
  const child = spawn(
    move.helper,
    [move.source, move.destination, String(process.pid), String(source.dev), String(source.ino), skipMoveArg],
    { detached: true, stdio: ["pipe", "ignore", "ignore"] },
  );
  const input = child.stdin;
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    input.on("error", reject);
    child.once("spawn", resolve);
  });
  return (shouldMove: boolean) => new Promise<void>((resolve, reject) => {
    input.once("error", reject);
    input.end(shouldMove ? "M" : undefined, () => {
      child.unref();
      resolve();
    });
  });
}
