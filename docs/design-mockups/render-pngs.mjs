#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("../../packages/nextjs/node_modules/sharp");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputArgs = process.argv.slice(2);

async function collectSvgPaths(inputPath) {
  const resolvedPath = path.resolve(process.cwd(), inputPath);
  const stat = await fs.stat(resolvedPath);

  if (stat.isDirectory()) {
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith(".svg"))
      .map(entry => path.join(resolvedPath, entry.name));
  }

  return resolvedPath.endsWith(".svg") ? [resolvedPath] : [];
}

const svgPaths = inputArgs.length
  ? (await Promise.all(inputArgs.map(collectSvgPaths))).flat()
  : (await collectSvgPaths(__dirname)).flat();

for (const svgPath of svgPaths) {
  const pngPath = svgPath.replace(/\.svg$/, ".png");
  await sharp(svgPath).png({ compressionLevel: 9, effort: 10 }).toFile(pngPath);
  console.log(`Rendered ${path.basename(pngPath)}`);
}
