 # Multi-stage build for production
  FROM node:24-alpine AS base
  WORKDIR /app
  COPY package.json ./

  FROM base AS build
  RUN npm install --ignore-scripts 2>/dev/null || true

  FROM base AS production
  RUN apk add --no-cache tini

  COPY --from=build /app/node_modules ./node_modules
  COPY src/ ./src/
  COPY data/ ./data/
  COPY public/ ./public/

  RUN mkdir -p data uploads && chown -R node:node /app
  USER node

  ENV NODE_ENV=production
  ENV PORT=3000
  ENV DATABASE_PROVIDER=sqlite
  ENV MARKETPLACE_DB_PATH=/app/data/marketplace.sqlite

  EXPOSE 3000

  ENTRYPOINT ["tini", "--"]
  CMD ["node", "src/server.js"]