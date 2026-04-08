#!/usr/bin/env node

if (
  process.env["SEIZE_6529_COMMAND"] !== "1" &&
  process.env["SEIZE_SECURE_INSTALL"] !== "1"
) {
  console.error("This repository only allows repo commands through the `6529` wrapper.");
  console.error("Use one of:");
  console.error("  6529 bootstrap");
  console.error("  6529 install");
  console.error("  6529 pull-web");
  console.error("  6529 run dev");
  console.error("  6529 run build");
  process.exit(1);
}
