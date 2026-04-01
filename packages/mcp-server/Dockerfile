FROM node:24-alpine

WORKDIR /app

ENV HUSKY=0

COPY .yarn/ ./.yarn/
COPY .yarnrc.yml package.json yarn.lock ./
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/contracts/tsconfig.json ./packages/contracts/tsconfig.json
COPY packages/contracts/src ./packages/contracts/src
COPY packages/mcp-server/package.json ./packages/mcp-server/package.json
COPY packages/mcp-server/tsconfig.json ./packages/mcp-server/tsconfig.json
COPY packages/mcp-server/src ./packages/mcp-server/src
COPY packages/node-utils/package.json ./packages/node-utils/package.json
COPY packages/node-utils/tsconfig.json ./packages/node-utils/tsconfig.json
COPY packages/node-utils/src ./packages/node-utils/src

RUN yarn install --immutable --mode=skip-build
RUN yarn workspace @curyo/mcp-server build

ENV NODE_ENV=production

EXPOSE 3334

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT:-3334}/healthz || exit 1

USER node

CMD ["sh", "-lc", "CURYO_MCP_HTTP_HOST=0.0.0.0 CURYO_MCP_HTTP_PORT=${PORT:-3334} yarn workspace @curyo/mcp-server start:http"]
