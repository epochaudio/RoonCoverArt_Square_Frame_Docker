FROM node:20-alpine AS deps

WORKDIR /app

# Git is only required while installing GitHub-based npm dependencies.
RUN apk add --no-cache git

COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force


FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node config/default.json ./config/default.json

# Runtime data paths (usually bind-mounted by docker-compose)
RUN mkdir -p /app/images && \
    touch /app/config.json && \
    chown node:node /app/images /app/config.json && \
    chmod 755 /app/images && \
    chmod 644 /app/config.json

USER node

EXPOSE 3666

CMD ["node", "src/server.js"]
