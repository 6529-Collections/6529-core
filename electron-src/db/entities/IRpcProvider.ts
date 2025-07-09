import { Entity, Column, PrimaryGeneratedColumn, Index } from "typeorm";
import { RPC_PROVIDERS_TABLE } from "../../../electron-constants";

@Entity({ name: RPC_PROVIDERS_TABLE })
export class RPCProvider {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 255, unique: true })
  url!: string;

  @Column({ type: "varchar", length: 50, unique: true })
  @Index()
  name!: string;

  @Column({ type: "boolean", default: false })
  @Index()
  active!: boolean;

  @Column({ type: "boolean", default: true })
  deletable!: boolean;
}
