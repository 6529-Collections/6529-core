import { z } from "zod";

const ethereumRpcEnvSchema = z.object({
  ETHEREUM_RPC_URL: z
    .string()
    .url("ETHEREUM_RPC_URL must be a valid URL")
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    }, "ETHEREUM_RPC_URL must use HTTP or HTTPS"),
});

export function getEthereumRpcUrl(): string {
  if (typeof process === "undefined" || !process.env) {
    throw new TypeError(
      "ETHEREUM_RPC_URL can only be accessed on the server side"
    );
  }

  // Core's embedded server cannot rely on the hosted frontend's private RPC
  // configuration. Retain the public 6529 endpoint already used by desktop
  // previews, while allowing a server-side override without bundling secrets.
  const parsed = ethereumRpcEnvSchema.safeParse({
    ETHEREUM_RPC_URL:
      process.env["ETHEREUM_RPC_URL"]?.trim() || "https://rpc1.6529.io",
  });
  if (!parsed.success) {
    const issue =
      parsed.error.issues[0]?.message ?? "ETHEREUM_RPC_URL is missing";
    throw new Error(issue);
  }

  return parsed.data.ETHEREUM_RPC_URL;
}
