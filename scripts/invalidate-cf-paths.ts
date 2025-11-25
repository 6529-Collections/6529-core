import {
  CloudFrontClient,
  CreateInvalidationCommand,
  ListDistributionsCommand,
} from "@aws-sdk/client-cloudfront";

const AWS_REGION = "eu-west-1";
const BUCKET_PATH_PRODUCTION = "6529-core-app";
const BUCKET_PATH_STAGING = "6529-staging-core-app";
const CF_DOMAIN = "d3lqz0a4bldqgf.cloudfront.net";

const cloudfront = new CloudFrontClient({ region: AWS_REGION });

const PLATFORMS = ["mac", "linux", "win"] as const;

function getHtmlPaths(version: string, isStaging: boolean): string[] {
  const bucketPath = isStaging ? BUCKET_PATH_STAGING : BUCKET_PATH_PRODUCTION;
  return PLATFORMS.map(
    (platform) => `/${bucketPath}/${platform}/links/${version}.html`
  );
}

async function getDistributionId(): Promise<string> {
  const command = new ListDistributionsCommand({ MaxItems: 100 });
  const response = await cloudfront.send(command);

  if (!response.DistributionList?.Items) {
    throw new Error("No CloudFront distributions found");
  }

  const distribution = response.DistributionList.Items.find(
    (dist) =>
      dist.Aliases?.Items?.includes(CF_DOMAIN) || dist.DomainName === CF_DOMAIN
  );

  if (!distribution?.Id) {
    throw new Error(
      `CloudFront distribution not found for domain: ${CF_DOMAIN}`
    );
  }

  return distribution.Id;
}

async function invalidatePaths(distributionId: string, paths: string[]) {
  console.log("Invalidating CloudFront cache for paths:", paths);
  const command = new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      Paths: {
        Quantity: paths.length,
        Items: paths,
      },
      CallerReference: `invalidate-cf-paths-${Date.now()}`,
    },
  });

  const response = await cloudfront.send(command);
  console.log(
    `Invalidation created: ${response.Invalidation?.Id} (Status: ${response.Invalidation?.Status})`
  );
}

async function main() {
  const isStaging = process.argv.includes("--staging");
  const versionArg = process.argv.find((arg) => arg.startsWith("--version="));
  
  if (!versionArg) {
    throw new Error("Version is required. Use --version=<version>");
  }

  const version = versionArg.split("=")[1];
  if (!version) {
    throw new Error("Version cannot be empty");
  }

  const bucketPath = isStaging ? BUCKET_PATH_STAGING : BUCKET_PATH_PRODUCTION;
  console.log(`Environment: ${isStaging ? "Staging" : "Production"}`);
  console.log(`Bucket Path: ${bucketPath}`);
  console.log(`Version: ${version}`);

  const paths = getHtmlPaths(version, isStaging);
  console.log(`Paths to invalidate:`, paths);

  const distributionId = await getDistributionId();
  console.log(`CloudFront Distribution ID: ${distributionId}`);

  await invalidatePaths(distributionId, paths);
  console.log("CloudFront invalidation completed");
}

main().catch((error) => {
  console.error("Failed to invalidate CloudFront cache:", error);
  process.exit(1);
});

