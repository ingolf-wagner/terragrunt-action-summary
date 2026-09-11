import type { Config } from "jest";

const config: Config = {
  projects: [
    {
      displayName: "unit",
      testMatch: ["<rootDir>/tests/*.test.ts"],
      snapshotResolver: "<rootDir>/tests/tofu-snapshots.ts",
      transform: {
        "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
      },
      moduleFileExtensions: ["ts", "js"],
      testPathIgnorePatterns: ["/integration/", "/node_modules/"],
    },
    {
      displayName: "integration",
      testMatch: ["<rootDir>/tests/integration/*.test.ts"],
      transform: {
        "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
      },
      moduleFileExtensions: ["ts", "js"],
      testTimeout: 120000,
    },
  ],
};

export default config;
