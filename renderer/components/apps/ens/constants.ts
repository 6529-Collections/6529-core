// constants.ts
import { mainnet, sepolia } from "wagmi/chains";

/**
 * Officially-deployed ENS contracts on mainnet + sepolia (NameWrapper-based).
 * For the most up-to-date addresses, refer to:
 * https://docs.ens.domains/ens-deployments
 */
export const ENS_CONTRACTS = {
  [mainnet.id]: {
    registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e", // ENS Registry
    baseRegistrar: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85", // BaseRegistrarImplementation
    controller: "0x253553366Da8546fC250F225fe3d25d0C782303b", // ETHRegistrarController
    publicResolver: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63", // Public Resolver
  },

  [sepolia.id]: {
    registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e", // ENS Registry (same address on testnets)
    baseRegistrar: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
    controller: "0xFED6a969AaA60E4961FCD3EBF1A2e8913ac65B72", // ENS Controller for Sepolia
    publicResolver: "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD", // Public Resolver on Sepolia
  },
};

/**
 * Grace period for expired domains to be renewed (90 days).
 * After this, the name can be released.
 */
export const ENS_GRACE_PERIOD = 90 * 24 * 60 * 60; // 90 days in seconds

/**
 * Minimal and maximal registration durations.
 * (Example: 28 days -> 1 year)
 */
export const MIN_REGISTRATION_DURATION = 28 * 24 * 60 * 60; // 28 days in seconds
export const MAX_REGISTRATION_DURATION = 365 * 24 * 60 * 60; // 1 year in seconds
