import { DataSource, DataSourceOptions } from "typeorm";

let AppDataSource: DataSource;

export const initWorkerDb = async (
  dbParams: DataSourceOptions,
  entities: Function[]
) => {
  AppDataSource = new DataSource({
    ...dbParams,
    entities,
    synchronize: true,
  });
  return await AppDataSource.initialize();
};

export const getWorkerDb = () => AppDataSource;
