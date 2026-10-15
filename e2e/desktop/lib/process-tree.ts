// Samples memory and CPU time for an app's whole process tree.
// Windows: one Win32_PerfRawData_PerfProc_Process query (private working set,
// private bytes, CPU time); Linux: /proc. Private working set is the number
// the plan reports as "private memory".

import { spawnSync } from "node:child_process";
import fs from "node:fs";

export interface ProcessSample {
  pid: number;
  ppid: number;
  name: string;
  /** main, renderer, gpu-process, utility:..., ipfs, or other */
  type: string;
  privateWorkingSet: number;
  privateBytes: number;
  cpuSeconds: number;
}

export interface TreeSample {
  at: number;
  processes: ProcessSample[];
}

const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$perf = Get-CimInstance Win32_PerfRawData_PerfProc_Process -Property IDProcess, CreatingProcessID, Name, PercentProcessorTime, WorkingSetPrivate, PrivateBytes
$out = foreach ($p in $perf) { if ($p.IDProcess -ne 0) { '{0}|{1}|{2}|{3}|{4}|{5}' -f $p.IDProcess, $p.CreatingProcessID, $p.Name, $p.PercentProcessorTime, $p.WorkingSetPrivate, $p.PrivateBytes } }
$out -join "\`n"
`;

const commandLineCache = new Map<number, string>();

function windowsCommandLines(pids: number[]): void {
  const missing = pids.filter((pid) => !commandLineCache.has(pid));
  if (missing.length === 0) return;
  const filter = missing.map((pid) => `ProcessId=${pid}`).join(" OR ");
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-CimInstance Win32_Process -Filter "${filter}" -Property ProcessId, CommandLine | ForEach-Object { '{0}|{1}' -f $_.ProcessId, $_.CommandLine }`,
    ],
    { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  for (const line of result.stdout.split(/\r?\n/)) {
    const index = line.indexOf("|");
    if (index > 0) commandLineCache.set(Number(line.slice(0, index)), line.slice(index + 1));
  }
  for (const pid of missing) if (!commandLineCache.has(pid)) commandLineCache.set(pid, "");
}

function classify(name: string, commandLine: string): string {
  if (/^ipfs(\.exe)?$/i.test(name) || /ipfs(\.exe)?["']?\s+daemon/i.test(commandLine)) return "ipfs";
  const type = commandLine.match(/--type=([a-z-]+)/)?.[1];
  if (type) {
    const sub = commandLine.match(/--utility-sub-type=([A-Za-z0-9._]+)/)?.[1];
    return sub ? `${type}:${sub}` : type;
  }
  if (/conhost/i.test(name)) return "conhost";
  return commandLine ? "main" : "other";
}

function descendants<T extends { pid: number; ppid: number }>(all: T[], rootPid: number): T[] {
  const byParent = new Map<number, T[]>();
  for (const proc of all) {
    const list = byParent.get(proc.ppid) ?? [];
    list.push(proc);
    byParent.set(proc.ppid, list);
  }
  const root = all.find((proc) => proc.pid === rootPid);
  if (!root) return [];
  const out: T[] = [];
  const queue = [root];
  const seen = new Set<number>();
  while (queue.length > 0) {
    const proc = queue.shift()!;
    if (seen.has(proc.pid)) continue;
    seen.add(proc.pid);
    out.push(proc);
    queue.push(...(byParent.get(proc.pid) ?? []));
  }
  return out;
}

function sampleWindows(rootPid: number): ProcessSample[] {
  const result = spawnSync("powershell", ["-NoProfile", "-Command", WINDOWS_SCRIPT], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const all = result.stdout
    .split(/\r?\n/)
    .map((line) => line.split("|"))
    .filter((parts) => parts.length === 6)
    .map(([pid, ppid, name, cpu, pws, priv]) => ({
      pid: Number(pid),
      ppid: Number(ppid),
      name: `${name}.exe`,
      cpuSeconds: Number(cpu) / 1e7,
      privateWorkingSet: Number(pws),
      privateBytes: Number(priv),
    }));
  const tree = descendants(all, rootPid);
  windowsCommandLines(tree.map((proc) => proc.pid));
  return tree.map((proc) => ({
    ...proc,
    name: proc.name.replace(/#\d+\.exe$/, ".exe"),
    type: classify(proc.name.replace(/#\d+\.exe$/, ".exe"), commandLineCache.get(proc.pid) ?? ""),
  }));
}

function sampleLinux(rootPid: number): ProcessSample[] {
  const ticks = 100;
  const all: Array<Omit<ProcessSample, "type"> & { cmd: string }> = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${entry}/stat`, "utf8");
      const close = stat.lastIndexOf(")");
      const name = stat.slice(stat.indexOf("(") + 1, close);
      const fields = stat.slice(close + 2).split(" ");
      const rollup = fs.existsSync(`/proc/${entry}/smaps_rollup`) ? fs.readFileSync(`/proc/${entry}/smaps_rollup`, "utf8") : "";
      const kb = (key: string) => Number(rollup.match(new RegExp(`^${key}:\\s+(\\d+) kB`, "m"))?.[1] ?? 0) * 1024;
      all.push({
        pid: Number(entry),
        ppid: Number(fields[1]),
        name,
        cpuSeconds: (Number(fields[11]) + Number(fields[12])) / ticks,
        privateWorkingSet: kb("Private_Clean") + kb("Private_Dirty"),
        privateBytes: kb("Private_Clean") + kb("Private_Dirty") + kb("SwapPss"),
        cmd: fs.readFileSync(`/proc/${entry}/cmdline`, "utf8").replace(/\0/g, " "),
      });
    } catch {
      // the process exited while we read it
    }
  }
  return descendants(all, rootPid).map(({ cmd, ...proc }) => ({ ...proc, type: classify(proc.name, cmd) }));
}

export function sampleTree(rootPid: number): TreeSample {
  const at = Date.now();
  if (process.platform === "win32") return { at, processes: sampleWindows(rootPid) };
  if (process.platform === "linux") return { at, processes: sampleLinux(rootPid) };
  return { at, processes: [] };
}

export function totals(sample: TreeSample) {
  const byType: Record<string, number> = {};
  for (const proc of sample.processes) {
    byType[proc.type] = (byType[proc.type] ?? 0) + proc.privateWorkingSet;
  }
  return {
    processes: sample.processes.length,
    privateWorkingSet: sample.processes.reduce((sum, proc) => sum + proc.privateWorkingSet, 0),
    privateBytes: sample.processes.reduce((sum, proc) => sum + proc.privateBytes, 0),
    cpuSeconds: sample.processes.reduce((sum, proc) => sum + proc.cpuSeconds, 0),
    byType,
  };
}
