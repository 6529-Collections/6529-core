import { Entity, Column, PrimaryColumn } from "typeorm";
import { NFTS_TABLE } from "../../../constants";

interface NFTAttribute {
  trait_type: string;
  value: string;
  display_type?: string;
}

interface NFTImageDetails {
  bytes: number;
  format: string;
  sha256: string;
  width: number;
  height: number;
}

interface NFTAnimationDetails {
  bytes: number;
  format: string;
  duration: number;
  sha256: string;
  width: number;
  height: number;
  codecs: string[];
}

interface NFTGenerator {
  metadata: string;
  html: string;
  image: string;
}

@Entity(NFTS_TABLE)
export class NFT {
  @PrimaryColumn({ type: "bigint" })
  id!: number;

  @PrimaryColumn({ type: "varchar", length: 50 })
  contract!: string;

  @Column({ type: "text" })
  uri!: string;

  @Column({ type: "bigint" })
  mint_date!: number;

  @Column({ type: "int", default: -1 })
  season?: number;

  @Column({ type: "int", default: 0 })
  edition_size!: number;

  @Column({ type: "int", default: 0 })
  burns!: number;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({ type: "text" })
  external_url!: string;

  @Column({ type: "simple-json", nullable: true })
  full_metadata!: any | null;

  @Column({ type: "text" })
  image_url!: string;

  @Column({ type: "simple-json", nullable: true })
  image_details!: NFTImageDetails | null;

  @Column({ type: "text", nullable: true })
  animation_url!: string | null;

  @Column({ type: "simple-json", nullable: true })
  animation_details!: NFTAnimationDetails | null;

  @Column({ type: "simple-json", nullable: false })
  attributes!: NFTAttribute[];

  @Column({ type: "int", default: 0 })
  tdh!: number;

  @Column({ type: "simple-json", nullable: true })
  generator!: NFTGenerator | null;
}
