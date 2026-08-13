import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

interface ElectronBuilderConfig {
  linux?: {
    desktop?: {
      entry?: Record<string, string>;
    };
  };
}

const EXPECTED_DESKTOP_ENTRIES = {
  "electron-builder.local.json": {
    Name: "6529 Desktop Local",
    Type: "Application",
    Terminal: "false",
    MimeType: "x-scheme-handler/localcore6529;",
    Categories: "Utility;Network;",
    Comment: "6529 Desktop Local Application",
  },
  "electron-builder.staging.json": {
    Name: "6529 Desktop Staging",
    Type: "Application",
    Terminal: "false",
    MimeType: "x-scheme-handler/stagingcore6529;",
    Categories: "Utility;Network;",
    Comment: "6529 Desktop Staging Application",
  },
  "electron-builder.production.json": {
    Name: "6529 Desktop",
    Type: "Application",
    Terminal: "false",
    MimeType: "x-scheme-handler/core6529;",
    Categories: "Utility;Network;",
    Comment: "6529 Desktop Application",
  },
} as const;

describe("Linux desktop builder configuration", () => {
  for (const [file, expectedEntry] of Object.entries(
    EXPECTED_DESKTOP_ENTRIES,
  )) {
    it(`${file} uses the electron-builder v26 desktop entry shape`, () => {
      const config = JSON.parse(
        readFileSync(resolve(process.cwd(), file), "utf8"),
      ) as ElectronBuilderConfig;

      assert.deepEqual(config.linux?.desktop?.entry, expectedEntry);
    });
  }
});
