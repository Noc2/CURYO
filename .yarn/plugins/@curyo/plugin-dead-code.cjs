"use strict";

module.exports = {
  name: "@curyo/plugin-dead-code",
  factory: require => {
    const { BaseCommand } = require("@yarnpkg/cli");
    const { Command, Option } = require("clipanion");
    const { spawnSync } = require("child_process");
    const fs = require("fs");
    const path = require("path");

    const installArgs = ["install", "--immutable", "--mode=skip-build"];
    const scanArgs = ["run", "dead-code:scan"];

    function yarnStateMissing(cwd) {
      return !fs.existsSync(path.join(cwd, "node_modules", ".yarn-state.yml"));
    }

    function resolveYarnInvocation() {
      const npmExecpath = process.env.npm_execpath;
      if (npmExecpath && npmExecpath.length > 0) {
        return { command: process.execPath, prefix: [npmExecpath] };
      }
      const fallback = process.platform === "win32" ? "yarn.cmd" : "yarn";
      return { command: fallback, prefix: [] };
    }

    function run(command, args, cwd) {
      const result = spawnSync(command, args, {
        cwd,
        stdio: "inherit",
      });

      if (typeof result.status === "number") {
        return result.status;
      }

      if (result.error) {
        console.error(`[dead-code] Failed to run ${command}: ${result.error.message}`);
      } else if (result.signal) {
        console.error(`[dead-code] ${command} terminated by signal ${result.signal}`);
      } else {
        console.error(`[dead-code] ${command} exited without a status code`);
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

          extraArgs = Option.Proxy();

          async execute() {
            const yarn = resolveYarnInvocation();
            if (yarnStateMissing(this.context.cwd)) {
              const installExitCode = run(yarn.command, [...yarn.prefix, ...installArgs], this.context.cwd);
              if (installExitCode !== 0) {
                return installExitCode;
              }
            }

            const forwardedScanArgs = this.extraArgs.length > 0 ? [...scanArgs, ...this.extraArgs] : scanArgs;
            return run(yarn.command, [...yarn.prefix, ...forwardedScanArgs], this.context.cwd);
          }
        },
      ],
    };
  },
};
