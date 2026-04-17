FROM node:24-alpine

WORKDIR /app

ENV HUSKY=0

COPY .yarn/ ./.yarn/
COPY .yarnrc.yml package.json yarn.lock ./
COPY packages/bot/package.json ./packages/bot/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/contracts/tsconfig.json ./packages/contracts/tsconfig.json
COPY packages/foundry/package.json ./packages/foundry/package.json
COPY packages/contracts/src ./packages/contracts/src
COPY packages/keeper/package.json ./packages/keeper/package.json
COPY packages/keeper/tsconfig.json ./packages/keeper/tsconfig.json
COPY packages/keeper/src ./packages/keeper/src
COPY packages/nextjs/package.json ./packages/nextjs/package.json
COPY packages/node-utils/package.json ./packages/node-utils/package.json
COPY packages/node-utils/tsconfig.json ./packages/node-utils/tsconfig.json
COPY packages/node-utils/src ./packages/node-utils/src
COPY packages/ponder/package.json ./packages/ponder/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json

RUN yarn install --immutable --mode=skip-build

WORKDIR /app/packages/keeper

EXPOSE 9090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null http://localhost:9090/health || exit 1

USER node
CMD ["yarn", "start"]
