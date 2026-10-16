import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from "typeorm";
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

  @Column({ type: "varchar", length: 66, nullable: true, default: null })
  block_hash!: string | null;
}

// Shadow tables allow a resumable upgrade without exposing partial history.
@Entity("consolidations_replay")
export class ReplayConsolidation extends Consolidation {}

@Entity("delegations_replay")
export class ReplayDelegation extends Delegation {}

@Entity("nft_delegation_replay_blocks")
export class NFTDelegationReplayBlock extends SingletonBlockEntity {
  @Column({ type: "int", default: 0 })
  index_version!: number;

  @Column({ type: "boolean", default: true })
  upgrade!: boolean;

  @Column({ type: "boolean", default: false })
  consolidations_changed!: boolean;

  @Column({ type: "varchar", length: 66, nullable: true, default: null })
  block_hash!: string | null;
}

// Retain every surviving registration, even entries sharing the public table's
// key or exceeding its token-ID range, to match the contract's ordered slots.
@Entity("native_delegation_registrations")
@Index(["from_address", "collection", "use_case"])
export class NativeDelegationRegistration {
  @PrimaryColumn({ type: "int" })
  block!: number;

  @PrimaryColumn({ type: "int" })
  log_index!: number;

  @Column({ type: "varchar", length: 50 })
  from_address!: string;

  @Column({ type: "varchar", length: 50 })
  to_address!: string;

  @Column({ type: "varchar", length: 50 })
  collection!: string;

  @Column({ type: "int" })
  use_case!: number;

  @Column({ type: "bigint" })
  registered_at!: number;

  @Column({ type: "boolean" })
  all_tokens!: boolean;

  @Column({ type: "varchar", length: 78 })
  // Token IDs span uint256; decimal text avoids JavaScript number precision loss.
  token_id!: string;

  @Column({ type: "bigint", nullable: true, default: null })
  // Normalized epoch seconds (including NEVER_DATE) fit safely in a number.
  expiry!: number | null;
}

@Entity("native_delegation_registrations_replay")
export class ReplayNativeDelegationRegistration extends NativeDelegationRegistration {}

// Bounded, transactional copies of staged state let shallow reorgs rewind
// revocations and consolidations too, not just delete recent registrations.
@Entity("nft_delegation_recovery_points")
export class NFTDelegationRecoveryPoint {
  @PrimaryColumn({ type: "int" })
  block!: number;

  @Column({ type: "varchar", length: 66 })
  block_hash!: string;

  @Column({ type: "text" })
  state!: string;
}

export interface WalletConsolidationKey {
  wallet: string;
  consolidation_key: string;
}
