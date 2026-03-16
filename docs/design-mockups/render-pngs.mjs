#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("../../packages/nextjs/node_modules/sharp");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const entries = await fs.readdir(__dirname, { withFileTypes: true });

for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith(".svg")) continue;

  const svgPath = path.join(__dirname, entry.name);
  const pngPath = svgPath.replace(/\.svg$/, ".png");

  await sharp(svgPath).png({ compressionLevel: 9, effort: 10 }).toFile(pngPath);
  console.log(`Rendered ${path.basename(pngPath)}`);
}
