// Imported first by index.ts, so the working folder is the app's own before
// any other module (the renderer server included) reads it.
import { app } from "electron";
import { appWorkingDirectory } from "./startup-cwd";

const directory = appWorkingDirectory(app.isPackaged, process.platform, process.execPath);
if (directory) {
  try {
    process.chdir(directory);
  } catch {
    // Keep the inherited folder; startup logs it as before.
  }
}
