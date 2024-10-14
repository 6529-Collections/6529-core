import Logger from "electron-log";
import { DataSource, DataSourceOptions } from "typeorm";

let AppDataSource: DataSource;

export const initWorkerDb = async (
  dbParams: DataSourceOptions,
  entities: Function[]
) => {
  try {
    AppDataSource = new DataSource({
      ...dbParams,
      entities,
      synchronize: true,
    });
    await AppDataSource.initialize();
    Logger.info("Database connection established");
  } catch (error) {
    Logger.error("Error during Data Source initialization:", error);
  }
};

export const getWorkerDb = () => AppDataSource;
