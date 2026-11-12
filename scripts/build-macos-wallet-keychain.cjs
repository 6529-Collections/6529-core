#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "darwin") {
  throw new Error("The macOS Keychain bridge requires a macOS build host.");
}
const root = path.resolve(__dirname, "..");
const headers =
  process.env.NODE_API_HEADERS ||
  path.resolve(path.dirname(process.execPath), "../include/node");
if (!fs.existsSync(path.join(headers, "node_api.h"))) {
  throw new Error(
    "Node-API headers missing; set NODE_API_HEADERS to the installed Node include/node directory.",
  );
}
const destination = process.argv[2];
if (!destination) throw new Error("The macOS Keychain bridge needs an output path.");
fs.mkdirSync(path.dirname(destination), { recursive: true });
const result = spawnSync(
  "xcrun",
  [
    "clang++",
    "-std=c++17",
    "-fobjc-arc",
    "-Wno-deprecated-declarations",
    "-shared",
    "-undefined",
    "dynamic_lookup",
    "-mmacosx-version-min=13.0",
    "-arch",
    "arm64",
    "-arch",
    "x86_64",
    "-DNAPI_VERSION=8",
    "-I",
    headers,
    "-framework",
    "Foundation",
    "-framework",
    "Security",
    path.join(root, "native/macos-wallet-keychain.mm"),
    "-o",
    destination,
  ],
  { cwd: root, stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
console.log("[wallet-passwords] Built universal macOS Keychain bridge");
