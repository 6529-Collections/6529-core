import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

interface PublishProvider {
  provider: string;
  path?: string;
}

interface ElectronBuilderConfig {
  publish?: PublishProvider[];
}

const EXPECTED_S3_PATHS = {
  "electron-builder.staging.json": "6529-staging-core-app/${os}",
  "electron-builder.production.json": "6529-core-app/${os}",
  "electron-builder.production-mac-arm64.json": "6529-core-app/${os}",
  "electron-builder.production-mac-x64.json": "6529-core-app/${os}",
} as const;

describe("desktop publish configuration", () => {
  for (const [file, expectedPath] of Object.entries(EXPECTED_S3_PATHS)) {
    it(`${file} uses a normalized S3 publish path`, () => {
      const config = JSON.parse(
        readFileSync(resolve(process.cwd(), file), "utf8"),
      ) as ElectronBuilderConfig;
      const s3Provider = config.publish?.find(
        ({ provider }) => provider === "s3",
      );

      assert.ok(s3Provider, `${file} must configure an S3 publisher`);
      assert.equal(s3Provider.path, expectedPath);
      assert.equal(s3Provider.path?.endsWith("/"), false);
    });
  }
});
