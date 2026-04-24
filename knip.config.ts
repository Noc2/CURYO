import type { KnipConfig } from "knip";

const testEntries = ["**/*.test.{js,mjs,cjs,ts,tsx}"];

const config: KnipConfig = {
  include: ["files", "dependencies", "devDependencies", "exports", "types"],
  ignoreWorkspaces: ["packages/foundry"],
  workspaces: {
    ".": {
      entry: ["scripts/**/*.{js,mjs,cjs,ts,tsx}"],
      project: ["scripts/**/*.{js,mjs,cjs,ts,tsx}"],
    },
    "packages/agents": {
      project: ["src/**/*.ts"],
    },
    "packages/contracts": {
      entry: [...testEntries],
      ignoreDependencies: ["tsx"],
      project: ["src/**/*.ts"],
    },
    "packages/keeper": {
      project: ["src/**/*.ts"],
    },
    "packages/nextjs": {
      entry: [
        "app/**/{page,layout,route,error,loading}.{ts,tsx}",
        "scripts/**/*.{js,mjs,cjs,ts,tsx}",
        "e2e/**/*.{ts,tsx}",
        ...testEntries,
      ],
      ignoreDependencies: ["daisyui", "eslint-config-next", "tailwindcss"],
      project: [
        "app/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "config/**/*.ts",
        "constants/**/*.ts",
        "contexts/**/*.{ts,tsx}",
        "e2e/**/*.{ts,tsx}",
        "hooks/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
        "scaffold.config.ts",
        "scripts/**/*.{js,mjs,cjs,ts,tsx}",
        "services/**/*.{ts,tsx}",
        "types/**/*.d.ts",
        "types/**/*.ts",
        "utils/**/*.{ts,tsx}",
      ],
    },
    "packages/node-utils": {
      project: ["src/**/*.ts"],
    },
    "packages/ponder": {
      entry: [
        "scripts/**/*.{js,mjs,cjs,ts,tsx}",
        "src/api/index.ts",
        "src/*.ts",
        ...testEntries,
      ],
      project: ["ponder.config*.ts", "scripts/**/*.{js,mjs,cjs,ts,tsx}", "src/**/*.ts"],
    },
    "packages/sdk": {
      entry: [...testEntries],
      ignoreDependencies: ["tsx"],
      project: ["src/**/*.ts"],
    },
  },
};

export default config;
