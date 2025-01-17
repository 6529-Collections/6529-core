import { Column, CreateDateColumn, Index, PrimaryColumn } from "typeorm";

export interface SingletonBlock {
  block: number;
  timestamp: number;
}

export interface Block {
  block_number: number;
  created_at: Date;
  block_timestamp: Date;
}

export abstract class SingletonBlockEntity {
  @PrimaryColumn()
  id: number = 1;

  @Column({ type: "int" })
  @Index()
  block!: number;

  @Column({ type: "bigint" })
  timestamp!: number;
}

export abstract class BlockEntity {
  @CreateDateColumn()
  created_at?: Date;

  @PrimaryColumn({ type: "int" })
  block!: number;

  @Column({ type: "bigint" })
  timestamp!: number;
}
