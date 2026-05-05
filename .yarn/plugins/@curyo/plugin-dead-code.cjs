"use strict";

module.exports = {
  name: "@curyo/plugin-dead-code",
  factory: require => {
    const { BaseCommand } = require("@yarnpkg/cli");
    const { Command } = require("clipanion");
    const { spawnSync } = require("child_process");

    const yarnCommand = process.platform === "win32" ? "yarn.cmd" : "yarn";
    const installArgs = ["install", "--immutable", "--mode=skip-build"];
    const scanArgs = ["run", "dead-code:scan"];

    function run(command, args, cwd) {
      const result = spawnSync(command, args, {
        cwd,
        stdio: "inherit",
        env: process.env,
      });

      if (typeof result.status === "number") {
        return result.status;
      }

      if (result.error) {
        console.error(`[dead-code] Failed to run ${command}: ${result.error.message}`);
      }

      return 1;
    }

    return {
      commands: [
        class DeadCodeCommand extends BaseCommand {
          static paths = [["dead-code"]];

          static usage = Command.Usage({
            category: "Project-specific commands",
            description: "Run the Knip dead-code scan after rebuilding Yarn node-modules state.",
          });

          async execute() {
            const installExitCode = run(yarnCommand, installArgs, this.context.cwd);
            if (installExitCode !== 0) {
              return installExitCode;
            }

            return run(yarnCommand, scanArgs, this.context.cwd);
          }
        },
      ],
    };
  },
};
