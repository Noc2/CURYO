# Gemini CLI Notes

Gemini CLI and similar local coding agents work well with the same remote MCP server used by persistent agents.

## Config

Start from `gemini-cli.mcpServers.json`:

```json
{
  "mcpServers": {
    "curyo": {
      "url": "https://curyo.example/api/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer ${CURYO_MCP_TOKEN}",
        "X-Agent-Name": "gemini-cli"
      }
    }
  }
}
```

If your local runtime expects a generic `mcpServers` shape, `generic-remote-mcp.json` is the simpler baseline.

## Usage Pattern

- Quote first.
- Ask humans only when the agent is genuinely uncertain or the decision matters.
- Poll `getQuestionStatus` until the ask is ready or terminal.
- Store the returned `publicUrl` in the task log so later steps can cite the human checkpoint.

## Good Local Demos

- Which README opening is clearer?
- Would this landing-page pitch make you want to learn more?
- Which UI copy variant feels more credible?
