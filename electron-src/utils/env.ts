import Logger from "electron-log";

export const isDev = process.argv.some((str) => str == "--dev");

Logger.info("MODE:", isDev ? "DEV" : "PROD");

if (!isDev) {
  console.log = (...args) => Logger.info(...args);
  console.info = (...args) => Logger.info(...args);
  console.warn = (...args) => Logger.warn(...args);
  console.error = (...args) => Logger.error(...args);
  console.debug = (...args) => Logger.debug(...args);
}
