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

async function ensureBotRuntime(role?: "submit" | "rate") {
  const configModule = await loadConfigModule();

  if (!role) {
    return;
  }

  configModule.validateConfig(role);

  try {
    const { validateBotConnectivity } = await import("./client.js");
    await validateBotConnectivity(role);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Bot] ERROR: ${message}`);
    process.exit(1);
  }
}

switch (command) {
  case "vote": {
    await ensureBotRuntime("rate");
    const { runVote } = await import("./commands/vote.js");
    await runVote();
    break;
  }
  case "submit": {
    const { formatSubmitUsage, parseSubmitCommandArgs } = await import("./submitOptions.js");
    let parsedSubmitCommand;
    try {
      parsedSubmitCommand = parseSubmitCommandArgs(process.argv.slice(3));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Bot] ERROR: ${message}`);
      console.log(formatSubmitUsage());
      process.exit(1);
    }

    if (parsedSubmitCommand.help) {
      console.log(formatSubmitUsage());
      process.exit(0);
    }

    await ensureBotRuntime("submit");
    const { runSubmit } = await import("./commands/submit.js");
    await runSubmit(parsedSubmitCommand.options);
    break;
  }
  case "status": {
    await ensureBotRuntime();
    const { runStatus } = await import("./commands/status.js");
    await runStatus();
    break;
  }
  default:
    console.log(`Usage:
  yarn submit|vote|status
  yarn bot:submit|bot:vote|bot:status

Commands:
  submit  Discover trending content from all platforms, submit to ContentRegistry
  vote    Rate content using external APIs, commit one initial vote per item
  status  Check both bot account statuses (balances, voter ID)`);
    process.exit(command ? 1 : 0);
}
