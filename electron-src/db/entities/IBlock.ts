import { Column, Index, PrimaryColumn } from "typeorm";

export interface Block {
  block: number;
  timestamp: number;
}

export abstract class BlockEntity {
  @PrimaryColumn()
  id: number = 1;

  @Column({ type: "int" })
  @Index()
  block!: number;

  @Column({ type: "bigint" })
  timestamp!: number;
}
