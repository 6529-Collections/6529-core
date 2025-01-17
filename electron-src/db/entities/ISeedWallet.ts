import { Entity, PrimaryColumn, Column, CreateDateColumn } from "typeorm";
import { SEED_WALLET_TABLE } from "../../../constants";

@Entity({ name: SEED_WALLET_TABLE })
export class SeedWallet {
  @PrimaryColumn({ type: "text", unique: true })
  address!: string;

  @Column({ type: "text" })
  address_hashed!: string;

  @Column({ type: "text", unique: true })
  name!: string;

  @Column({ type: "text" })
  mnemonic!: string;

  @Column({ type: "text" })
  private_key!: string;

  @Column({ type: "boolean", default: false })
  imported!: boolean;

  @CreateDateColumn()
  created_at!: Date;
}
