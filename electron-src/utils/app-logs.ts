import Logger from "electron-log";
import { getInfo } from "./info";
import { app, BrowserWindow, dialog } from "electron";
import fs from "fs";
import path from "path";
import minidump from "minidump";

export async function initLogs(): Promise<void> {
  const info = getInfo();
  for (const key in info) {
    Logger.info(`${key.replace("_", " ").toUpperCase()}:`, (info as any)[key]);
  }
}

export function openLogs(
  logsWindow: BrowserWindow,
  name: string,
  logFile: string
): void {
  Logger.info("Opening logs at:", logFile);
  logsWindow.loadFile(path.join(__dirname, "..", "assets/logs.html"));
  logsWindow.setTitle(`${name} | Logs | 6529 Core`);

  const loadLogs = () => {
    fs.readFile(logFile, "utf8", (err, logs) => {
      if (err) {
        Logger.error("Error reading log file:", err);
        return;
      }
      logsWindow?.webContents.send("log-updated", logs);
    });
  };

  loadLogs();

  fs.watchFile(logFile, { interval: 1000 }, () => {
    loadLogs();
  });
}

export function closeLogs(logFile: string): void {
  fs.unwatchFile(logFile);
}

export function getCrashReportsList(): { fileName: string; date: number }[] {
  const crashReportsDir = path.join(app.getPath("crashDumps"), "pending");
  if (!fs.existsSync(crashReportsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(crashReportsDir)
    .filter((file) => file.endsWith(".dmp"));

  return files.map((file) => {
    const filePath = path.join(crashReportsDir, file);
    const stats = fs.statSync(filePath);

    return {
      fileName: file,
      path: filePath,
      date: stats.mtimeMs,
    };
  });
}

export async function extractCrashReport(fileName: string) {
  const crashReportsDir = path.join(app.getPath("crashDumps"), "pending");
  const filePath = path.join(crashReportsDir, fileName);
  if (fs.existsSync(filePath)) {
    minidump.walkStack(filePath, async (err, report) => {
      if (err) {
        console.error("Error parsing .dmp file:", err);
        return;
      }

      const { filePath: savePath } = await dialog.showSaveDialog({
        defaultPath: `crash_report-${fileName}.txt`,
        title: "Save Crash Report",
      });

      if (!savePath) {
        Logger.info("User canceled the download.");
        return;
      }

      fs.writeFileSync(savePath, report);
      Logger.info(`Crash report saved to ${savePath}`);
    });
  }
}
