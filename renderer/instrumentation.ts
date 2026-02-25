export async function register() {
  if (!process.env["SENTRY_DSN"]) return;
  const runtime = process.env["NEXT_RUNTIME"];
  if (runtime === "nodejs") await import("./sentry.server.config");
  if (runtime === "edge") await import("./sentry.edge.config");
}

export const onRequestError = undefined;
