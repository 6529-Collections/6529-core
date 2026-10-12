import { Entity, Column, PrimaryColumn, CreateDateColumn } from "typeorm";
import { SingletonBlockEntity } from "./IBlock";
import {
  CONSOLIDATIONS_TABLE,
  DELEGATIONS_TABLE,
  NFTDELEGATION_BLOCKS_TABLE,
  NEVER_DATE,
} from "../../../electron-constants";

@Entity(CONSOLIDATIONS_TABLE)
export class Consolidation {
  @CreateDateColumn()
  created_at!: Date;

  @Column({ type: "int" })
  block!: number;

  @PrimaryColumn({ type: "varchar", length: 50 })
  wallet1!: string;

  @PrimaryColumn({ type: "varchar", length: 50 })
  wallet2!: string;

  @Column({ type: "boolean", default: false })
  confirmed!: boolean;

  // Actual registration block times in Unix seconds; unknown legacy times
  // remain NULL until replayed and never qualify for four-wallet activation.
  @Column({ type: "bigint", nullable: true, default: null })
  wallet1_registered_at!: number | null;

  @Column({ type: "bigint", nullable: true, default: null })
  wallet2_registered_at!: number | null;
}

@Entity(DELEGATIONS_TABLE)
export class Delegation {
  @CreateDateColumn()
  created_at!: Date;

  @PrimaryColumn({ type: "int" })
  block!: number;

  @PrimaryColumn({ type: "varchar", length: 50 })
  from_address!: string;

  @PrimaryColumn({ type: "varchar", length: 50 })
  to_address!: string;

  @PrimaryColumn({ type: "varchar", length: 50 })
  collection!: string;

  @PrimaryColumn({ type: "int" })
  use_case!: number;

  @Column({ type: "bigint", default: NEVER_DATE })
  expiry!: number;

  @Column({ type: "boolean", default: true })
  all_tokens!: boolean;

  @Column({ type: "int", default: 0 })
  token_id!: number;
}

export enum EventType {
  REGISTER,
  REVOKE,
}

export interface Event {
  block: number;
  type: EventType;
  wallet1: string;
  wallet2: string;
  timestamp?: number;
  log_index?: number;
}

export type ConsolidationEvent = Event;

export interface DelegationEvent extends ConsolidationEvent {
  collection: string;
  use_case: number;
  expiry?: number;
  all_tokens?: boolean;
  token_id?: number;
}

@Entity(NFTDELEGATION_BLOCKS_TABLE)
export class NFTDelegationBlock extends SingletonBlockEntity {
  @Column({ type: "int", default: 0 })
  index_version!: number;
}

// Shadow tables allow a resumable upgrade without exposing partial history.
@Entity("consolidations_replay")
export class ReplayConsolidation extends Consolidation {}

@Entity("delegations_replay")
export class ReplayDelegation extends Delegation {}

@Entity("nft_delegation_replay_blocks")
export class NFTDelegationReplayBlock extends SingletonBlockEntity {}

export interface WalletConsolidationKey {
  wallet: string;
  consolidation_key: string;
}
