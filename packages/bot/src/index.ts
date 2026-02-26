import "dotenv/config";
import { validateConfig } from "./config.js";

const command = process.argv[2];

switch (command) {
  case "vote": {
    validateConfig("rate");
    const { runVote } = await import("./commands/vote.js");
    await runVote();
    break;
  }
  case "submit": {
    validateConfig("submit");
    const { runSubmit } = await import("./commands/submit.js");
    await runSubmit();
    break;
  }
  case "status": {
    const { runStatus } = await import("./commands/status.js");
    await runStatus();
    break;
  }
  default:
    console.log(`Usage: yarn bot [vote|submit|status]

Commands:
  submit  Discover trending content from all platforms, submit to ContentRegistry
  vote    Rate content using external APIs, commit one initial vote per item
  status  Check both bot account statuses (balances, voter ID)`);
    process.exit(command ? 1 : 0);
}
