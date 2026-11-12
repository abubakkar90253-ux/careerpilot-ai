import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(packageDir, "src", "cliplab");
const outputDir = path.join(packageDir, "dist", "cliplab");

await mkdir(outputDir, { recursive: true });
await Promise.all(
  ["LICENSE", "PROVENANCE.md"].map((file) =>
    copyFile(path.join(sourceDir, file), path.join(outputDir, file)),
  ),
);
