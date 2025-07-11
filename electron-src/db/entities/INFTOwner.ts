import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { NFT_OWNERS_TABLE } from "../../../electron-constants";

@Entity(NFT_OWNERS_TABLE)
export class NFTOwner {
  @CreateDateColumn()
  created_at?: Date;

  @UpdateDateColumn()
  updated_at?: Date;

  @PrimaryColumn({ type: "varchar", length: 50 })
  address!: string;

  @PrimaryColumn({ type: "varchar", length: 50 })
  contract!: string;

  @Index()
  @PrimaryColumn({ type: "bigint" })
  token_id!: number;

  @Column({ type: "int" })
  balance!: number;
}
