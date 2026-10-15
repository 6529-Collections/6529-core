import { execFile } from "node:child_process";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import pRetry from "p-retry";

import {
  createMuseumPublicationBuildSnapshot,
  MUSEUM_PUBLICATION_BUILD_SNAPSHOT_PATH,
} from "../lib/museum/publication/buildSnapshot.server";
import { museumPublicationCatalogResolver } from "../lib/museum/publication/catalog";
import { GitHubMuseumPublicationSource } from "../lib/museum/publication/github";
import { legacyCaseyPublicationAssembler } from "../lib/museum/publication/legacyCasey";
import {
  isExactGitCommit,
  MUSEUM_REPOSITORY_NAME,
} from "../lib/museum/publication/security";

const BUILD_SNAPSHOT_RETRIES = 2;
const BUILD_SNAPSHOT_RETRY_DELAY_MS = 1_000;
const execFileAsync = promisify(execFile);
const retryOptions = {
  retries: BUILD_SNAPSHOT_RETRIES,
  minTimeout: BUILD_SNAPSHOT_RETRY_DELAY_MS,
  factor: 2,
  randomize: true,
};

async function resolveMuseumBuildCommit(): Promise<string> {
  // Core builds must not depend on the anonymous GitHub REST API quota.
  // Pin the public Git ref once; the source still verifies the full catalog,
  // manifest and document fixity against this immutable commit.
  const { stdout } = await execFileAsync(
    "git",
    [
      "ls-remote",
      "--exit-code",
      "--refs",
      `https://github.com/${MUSEUM_REPOSITORY_NAME}.git`,
      "refs/heads/main",
    ],
    {
      timeout: 30_000,
      maxBuffer: 4096,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }
  );
  const [commit, ref, ...extra] = stdout.trim().split(/\s+/u);
  if (
    commit === undefined ||
    !isExactGitCommit(commit) ||
    ref !== "refs/heads/main" ||
    extra.length !== 0
  ) {
    throw new Error("publication_git_ref_invalid");
  }
  return commit;
}

async function main(): Promise<void> {
  const ref = await pRetry(resolveMuseumBuildCommit, retryOptions);
  const source = new GitHubMuseumPublicationSource({
    ref,
    assembler: legacyCaseyPublicationAssembler,
    catalogResolver: museumPublicationCatalogResolver,
  });
  const state = await pRetry(
    async () => {
      const candidate = await source.load();
      if (candidate.status !== "current") {
        throw new Error(
          candidate.errorCode ?? "publication_build_snapshot_unavailable"
        );
      }
      return candidate;
    },
    retryOptions
  );

  const snapshot = createMuseumPublicationBuildSnapshot(state.publication);
  const outputPath = path.resolve(
    process.cwd(),
    MUSEUM_PUBLICATION_BUILD_SNAPSHOT_PATH
  );
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  await rename(temporaryPath, outputPath);

  process.stdout.write(
    `${JSON.stringify({
      contract: snapshot.contract,
      generatedAt: snapshot.generatedAt,
      publicationCommit: snapshot.publication.identity.commit,
      catalogId: snapshot.publication.identity.catalogId ?? null,
      inventoryCount: snapshot.publication.identity.inventoryCount,
    })}\n`
  );
}

void main().catch((error: unknown) => {
  const errorCode =
    error instanceof Error && error.message.length > 0
      ? error.message
      : "publication_build_snapshot_failed";
  process.stderr.write(`${errorCode}\n`);
  process.exitCode = 1;
});
