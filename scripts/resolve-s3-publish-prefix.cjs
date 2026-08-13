#!/usr/bin/env node

const OS_PLACEHOLDER = "${os}";

function resolveS3PublishPrefix(pathTemplate, os) {
  if (typeof pathTemplate !== "string" || pathTemplate.trim().length === 0) {
    throw new Error("S3 publish path must be a non-empty string.");
  }
  if (typeof os !== "string" || !/^[a-z0-9][a-z0-9_-]*$/i.test(os)) {
    throw new Error(`Invalid S3 publish OS segment: ${os}`);
  }

  const expandedPath = pathTemplate.split(OS_PLACEHOLDER).join(os);
  if (expandedPath.startsWith("/")) {
    throw new Error("S3 publish path must not start with a slash.");
  }

  const normalizedPath = expandedPath.replace(/\/+$/, "");
  if (normalizedPath.length === 0) {
    throw new Error("S3 publish path must contain a key prefix.");
  }

  return `${normalizedPath}/`;
}

if (require.main === module) {
  const [pathTemplate, os] = process.argv.slice(2);
  try {
    process.stdout.write(resolveS3PublishPrefix(pathTemplate, os));
  } catch (error) {
    console.error(
      `[resolve-s3-publish-prefix] ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}

module.exports = { resolveS3PublishPrefix };
