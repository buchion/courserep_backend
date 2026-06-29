FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json yarn.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps/ai-worker ./apps/ai-worker
RUN corepack enable && yarn install || true
RUN yarn workspace @cr-agentic/database prisma:generate \
  && yarn build:packages \
  && yarn workspace @cr-agentic/ai-worker build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
CMD ["node", "apps/ai-worker/dist/worker.js"]
