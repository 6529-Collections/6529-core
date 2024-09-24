import Logger from "electron-log";
import { app } from "electron/main";
import { join } from "path";

const databasePath = join(app.getPath("userData"), "database.sqlite");
Logger.log(`Starting Session\n\n---------- New Session ----------\n`);
Logger.info("DATABASE:", databasePath);

export default databasePath;
