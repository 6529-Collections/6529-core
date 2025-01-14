import { Column, PrimaryGeneratedColumn } from "typeorm";

import { Entity } from "typeorm";

export const CORE_MIGRATION_TABLE = "core_migration";

@Entity(CORE_MIGRATION_TABLE)
export class CoreMigration {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "text", unique: true })
  migration_name!: string;

  @Column({ type: "datetime", default: () => "CURRENT_TIMESTAMP" })
  created_at!: Date;
}
