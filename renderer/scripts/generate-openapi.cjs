const {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const tmpDir = path.join(root, "tmp_gen_outp");
const generatedDir = path.join(root, "generated");

function addTsNoCheck(directory) {
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      addTsNoCheck(entryPath);
      continue;
    }
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) {
      continue;
    }

    const content = normalizeFileContent(readFileSync(entryPath, "utf8"));
    if (content.startsWith("// @ts-nocheck\n")) {
      writeFileSync(entryPath, content);
      continue;
    }
    writeFileSync(entryPath, `// @ts-nocheck\n${content}`);
  }
}

function normalizeFileContent(content) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const normalizedLines = lines.map((line) => line.replace(/[ \t]+$/u, ""));

  while (
    normalizedLines.length > 0 &&
    normalizedLines[normalizedLines.length - 1] === ""
  ) {
    normalizedLines.pop();
  }

  return `${normalizedLines.join(eol)}${eol}`;
}

rmSync(tmpDir, { force: true, recursive: true });

const generator = path.join(
  root,
  "node_modules",
  "@openapitools",
  "openapi-generator-cli",
  "main"
);
const result = spawnSync(
  process.execPath,
  [
    generator,
    "generate",
    "-i",
    "openapi.yaml",
    "-g",
    "typescript",
    "-o",
    "tmp_gen_outp",
    "--additional-properties=modelPropertyNaming=snake_case",
  ],
  { cwd: root, stdio: "inherit" }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

rmSync(generatedDir, { force: true, recursive: true });
mkdirSync(generatedDir, { recursive: true });
renameSync(path.join(tmpDir, "models"), path.join(generatedDir, "models"));
rmSync(tmpDir, { force: true, recursive: true });
mkdirSync(path.join(generatedDir, "http"), { recursive: true });
writeFileSync(
  path.join(generatedDir, "http", "http.ts"),
  "export type HttpFile = any;\n"
);
rmSync(path.join(generatedDir, "models", "all.ts"), { force: true });
addTsNoCheck(generatedDir);
