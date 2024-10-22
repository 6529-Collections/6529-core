import fs from "fs";
import path from "path";

export type LogLevel = "log" | "error" | "warn" | "info" | "debug";

export class WorkerLogger {
  private logFilePath: string;
  private namespace: string;

  constructor(namespace: string, logDirectory: string) {
    this.namespace = namespace;
    this.logFilePath = path.join(logDirectory, `${namespace}.log`);
  }

  private writeLog(message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] > [${this.namespace}] ${message}\n`;

    fs.appendFileSync(this.logFilePath, logMessage, { encoding: "utf8" });
  }

  public log(level: LogLevel, ...args: any[]) {
    this.writeLog(`[${level.toUpperCase()}] > ${args.join(" ")}`);
  }

  public error(error: Error) {
    this.writeLog(`[ERROR] > ${error.toString()}`);
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }
}
