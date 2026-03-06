const command = process.argv[2];

export {};

async function loadConfigModule() {
  try {
    return await import("./config.js");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Bot] ERROR: ${message}`);
    process.exit(1);
  }
}

switch (command) {
  case "vote": {
    const { validateConfig } = await loadConfigModule();
    validateConfig("rate");
    const { runVote } = await import("./commands/vote.js");
    await runVote();
    break;
  }
  case "submit": {
    const { validateConfig } = await loadConfigModule();
    validateConfig("submit");
    const { runSubmit } = await import("./commands/submit.js");
    await runSubmit();
    break;
  }
  case "status": {
    await loadConfigModule();
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
