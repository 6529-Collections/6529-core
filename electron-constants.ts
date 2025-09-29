export const SEED_WALLET_TABLE = "seed_wallets";
export const TRANSACTIONS_TABLE = "transactions";
export const TRANSACTIONS_BLOCKS_TABLE = "transactions_blocks";
export const NFT_OWNERS_TABLE = "nft_owners";
export const NFTS_TABLE = "nfts";
export const DELEGATIONS_TABLE = "delegations";
export const CONSOLIDATIONS_TABLE = "consolidations";
export const NFTDELEGATION_BLOCKS_TABLE = "nft_delegation_blocks";
export const RPC_PROVIDERS_TABLE = "rpc_providers";
export const WALLETS_TDH_TABLE = "tdh";
export const CONSOLIDATED_WALLETS_TDH_TABLE = "tdh_consolidation";
export const TDH_BLOCKS_TABLE = "tdh_blocks";
export const TDH_MERKLE_ROOT_TABLE = "tdh_merkle_root";

export const ADD_SEED_WALLET = "addSeedWallet";
export const IMPORT_SEED_WALLET = "importSeedWallet";
export const DELETE_SEED_WALLET = "deleteSeedWallet";
export const GET_SEED_WALLETS = "getSeedWallets";
export const GET_SEED_WALLET = "getSeedWallet";
export const ADD_RPC_PROVIDER = "addRpcProvider";
export const SET_RPC_PROVIDER_ACTIVE = "setRpcProviderActive";
export const DEACTIVATE_RPC_PROVIDER = "deactivateRpcProvider";
export const DELETE_RPC_PROVIDER = "deleteRpcProvider";
export const MANUAL_START_WORKER = "manualStartWorker";
export const RESET_TRANSACTIONS_TO_BLOCK = "resetTransactionsToBlock";
export const RECALCULATE_TRANSACTIONS_OWNERS = "recalculateTransactionsOwners";
export const RESET_WORKER = "resetWorker";
export const STOP_WORKER = "stopWorker";

export const MNEMONIC_NA = "N/A";

export const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
export const NULL_ADDRESS_DEAD = "0x000000000000000000000000000000000000dead";
export const MANIFOLD_ADDRESS = "0x3A3548e060Be10c2614d0a4Cb0c03CC9093fD799";

export const DELEGATION_CONTRACT: {
  chain_id: number;
  contract: `0x${string}`;
  deploy_block: number;
} = {
  chain_id: 1,
  contract: "0x2202CB9c00487e7e8EF21e6d8E914B32e709f43d",
  deploy_block: 17114430,
};

export const DELEGATION_ALL_ADDRESS =
  "0x8888888888888888888888888888888888888888";

export const USE_CASE_ALL = 1;
export const USE_CASE_MINTING = 2;
export const USE_CASE_AIRDROPS = 3;
export const USE_CASE_PRIMARY_ADDRESS = 997;
export const USE_CASE_SUB_DELEGATION = 998;
export const USE_CASE_CONSOLIDATION = 999;
export const CONSOLIDATIONS_LIMIT = 3;
export const NEVER_DATE = 64060588800;

export const MEME_8_EDITION_BURN_ADJUSTMENT = -2588;
export const MEME_8_BURN_TRANSACTION =
  "0xa6c27335d3c4f87064a938e987e36525885cc3d136ebb726f4c5d374c0d2d854";
