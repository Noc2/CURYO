# OpenClaw Notes

OpenClaw-style persistent agents are a good fit for Curyo's remote MCP surface because they can keep memory, tools, and background loops alive across asks.

## Config

Start from `generic-public-mcp.json` when OpenClaw already controls a funded wallet. Use `openclaw.mcpServers.json` when you also want a saved managed policy and bearer token:

```json
{
  "mcpServers": {
    "curyo": {
      "url": "https://curyo.example/api/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer ${CURYO_MCP_TOKEN}",
        "X-Agent-Name": "openclaw"
      }
    }
  }
}
```

Bearer tokens are optional. Use them with narrow scopes and small budget caps when you want Curyo-enforced policy limits, callbacks, or managed audit exports.

## Loop

1. list templates
2. quote the ask
3. ask humans with a stable `clientRequestId`
4. wait for callback or poll status
5. fetch the structured result
6. store `operationKey`, `publicUrl`, `answer`, and `recommendedNextAction` in memory

## First Demo

Use the landing-page pitch checkpoint:

- The agent writes a short pitch.
- The agent asks `Would this pitch make you want to learn more?`
- The agent revises when the result says `revise` or confidence is weak.

## Recovery

- Use callbacks as a wakeup, not as final truth.
- Recover missed deliveries through `getQuestionStatus`.
- Avoid duplicate asks by remembering `clientRequestId` and `operationKey`.
