FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY tsconfig.json ./

EXPOSE 9090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null http://localhost:9090/health || exit 1

USER node
CMD ["npx", "tsx", "src/index.ts"]
