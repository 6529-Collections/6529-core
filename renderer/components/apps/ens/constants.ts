import { mainnet, sepolia } from "wagmi/chains";

/** Officially-deployed ENS contracts on mainnet + sepolia. */
export const ENS_CONTRACTS = {
  [mainnet.id]: {
    registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    baseRegistrar: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
    controller: "0x253553366Da8546fC250F225fe3d25d0C782303b",
    publicResolver: "0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb",
  },

  /**
   * Sepolia addresses (NameWrapper-based ENS deployment, from official docs):
   * https://docs.ens.domains/ens-deployments
   */
  [sepolia.id]: {
    registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    baseRegistrar: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
    controller: "0xFED6a969AaA60E4961FCD3EBF1A2e8913ac65B72",
    publicResolver: "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD",
  },
};
export const ENS_GRACE_PERIOD = 90 * 24 * 60 * 60; // 90 days in seconds
export const MIN_REGISTRATION_DURATION = 28 * 24 * 60 * 60; // 28 days in seconds
export const MAX_REGISTRATION_DURATION = 365 * 24 * 60 * 60; // 1 year in seconds

export const REGISTRATION_STEPS = {
  COMMIT: "commit",
  WAIT: "wait",
  REGISTER: "register",
  COMPLETE: "complete",
} as const;

export type RegistrationStep =
  (typeof REGISTRATION_STEPS)[keyof typeof REGISTRATION_STEPS];

export interface RegistrationParameters {
  name: string;
  owner: string;
  duration: number;
  secret: string;
  resolver: string;
  addresses: Record<string, string>;
  texts: Record<string, string>;
}
