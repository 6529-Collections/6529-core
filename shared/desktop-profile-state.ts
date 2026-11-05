export interface DesktopProfile {
  readonly address: string;
  readonly role: string | null;
  readonly jwt: string | null;
  readonly profileId: string | null;
  readonly profileHandle: string | null;
  readonly authSessionVersion: "v2" | null;
  readonly refreshToken: null;
}

export interface DesktopProfileState {
  readonly version: 1;
  readonly accounts: readonly DesktopProfile[];
  readonly activeAddress: string | null;
}

const ADDRESS = /^0x[0-9a-f]{40}$/i;
export const MAX_DESKTOP_PROFILES = 5;

function nullableString(value: unknown, limit: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > limit) {
    throw new Error("Invalid saved Desktop profile field");
  }
  return value;
}

// Copy only known fields. Native refresh credentials never enter this snapshot.
export function parseDesktopProfileState(value: unknown): DesktopProfileState {
  if (!value || typeof value !== "object")
    throw new Error("Invalid Desktop profile state");
  const state = value as Record<string, unknown>;
  if (
    state["version"] !== 1 ||
    !Array.isArray(state["accounts"]) ||
    state["accounts"].length > MAX_DESKTOP_PROFILES
  ) {
    throw new Error("Invalid Desktop profile state");
  }
  const addresses = new Set<string>();
  const accounts = state["accounts"].map((value: unknown): DesktopProfile => {
    if (!value || typeof value !== "object")
      throw new Error("Invalid Desktop profile");
    const account = value as Record<string, unknown>;
    if (
      typeof account["address"] !== "string" ||
      !ADDRESS.test(account["address"])
    ) {
      throw new Error("Invalid Desktop profile address");
    }
    const address = account["address"].toLowerCase();
    if (addresses.has(address)) throw new Error("Duplicate Desktop profile");
    addresses.add(address);
    return {
      address,
      role: nullableString(account["role"], 200),
      jwt: nullableString(account["jwt"], 32_768),
      profileId: nullableString(account["profileId"], 200),
      profileHandle: nullableString(account["profileHandle"], 200),
      authSessionVersion: account["authSessionVersion"] === "v2" ? "v2" : null,
      refreshToken: null,
    };
  });
  const activeAddress =
    nullableString(state["activeAddress"], 42)?.toLowerCase() ?? null;
  if (activeAddress !== null && !addresses.has(activeAddress)) {
    throw new Error("Active Desktop profile is not in the saved list");
  }
  return { version: 1, accounts, activeAddress };
}
