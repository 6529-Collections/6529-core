import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const { resolveS3PublishPrefix } = require(
  "../scripts/resolve-s3-publish-prefix.cjs",
) as {
  resolveS3PublishPrefix: (pathTemplate: string, os: string) => string;
};

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

const TEST_ARTIFACT = "6529-DESKTOP-mac-arm64-0.3.12.zip";

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

      const platformPath = expectedPath.replace("${os}", "mac");
      assert.equal(
        `${s3Provider.path.replace("${os}", "mac")}/${TEST_ARTIFACT}`,
        `${platformPath}/${TEST_ARTIFACT}`,
      );
      assert.equal(
        `${resolveS3PublishPrefix(expectedPath, "mac")}${TEST_ARTIFACT}`,
        `${platformPath}/${TEST_ARTIFACT}`,
      );
    });
  }

  it("normalizes manual upload prefixes to exactly one trailing slash", () => {
    assert.equal(
      resolveS3PublishPrefix("6529-core-app/${os}", "mac"),
      "6529-core-app/mac/",
    );
    assert.equal(
      resolveS3PublishPrefix("6529-core-app/${os}//", "mac"),
      "6529-core-app/mac/",
    );
  });

  it("routes the production macOS workflow through the tested prefix resolver", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github", "workflows", "build-mac.yml"),
      "utf8",
    );

    assert.match(
      workflow,
      /PATH_PREFIX=\$\(node scripts\/resolve-s3-publish-prefix\.cjs "\$RAW_PATH" mac\)/,
    );
  });
});
