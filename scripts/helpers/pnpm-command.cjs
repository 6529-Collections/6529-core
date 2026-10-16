// Node 20.12 and later refuse to spawn Windows .cmd shims without a shell
// (spawnSync pnpm.cmd EINVAL). Under `pnpm run`, npm_execpath points at
// pnpm's own JavaScript entry, which runs with this Node and needs no shell.
function resolvePnpmCommand(command, args, env = process.env) {
  if (process.platform !== "win32" || command !== "pnpm") {
    return { executable: command, args };
  }
  const pnpmEntry = env.npm_execpath;
  if (pnpmEntry && /\.[cm]?js$/i.test(pnpmEntry)) {
    return { executable: process.execPath, args: [pnpmEntry, ...args] };
  }
  return { executable: "pnpm.cmd", args, shell: true };
}

module.exports = { resolvePnpmCommand };
