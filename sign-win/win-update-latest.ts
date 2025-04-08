import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as yaml from "js-yaml";

const distDir = path.join(__dirname, "../dist");

function getSha512(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha512");
  hash.update(buffer);
  return hash.digest("base64");
}

function getFileSize(filePath: string): number {
  const stats = fs.statSync(filePath);
  return stats.size;
}

function updateLatestYml(): void {
  const ymlFilePath = path.join(distDir, "latest.yml");
  let latestYml: any = {};

  if (fs.existsSync(ymlFilePath)) {
    const ymlContent = fs.readFileSync(ymlFilePath, "utf8");
    latestYml = yaml.load(ymlContent);
  } else {
    throw new Error("latest.yml file not found in dist directory.");
  }

  latestYml.files.forEach((file: any) => {
    const filePath = path.join(distDir, file.url);
    if (fs.existsSync(filePath)) {
      file.sha512 = getSha512(filePath);
      file.size = getFileSize(filePath);
    } else {
      throw new Error(`File "${file.url}" not found in dist directory.`);
    }
  });

  latestYml.path = latestYml.files[0].url;
  latestYml.sha512 = latestYml.files[0].sha512;

  latestYml.releaseDate = new Date().toISOString();

  const ymlContent = yaml.dump(latestYml, { lineWidth: -1 });
  fs.writeFileSync(ymlFilePath, ymlContent, "utf8");

  console.log("latest.yml has been updated successfully!");
}

// Run the update function
updateLatestYml();
