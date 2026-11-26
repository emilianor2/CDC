FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev --include=optional
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY . .

CMD ["sh", "-c", "node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config docker/wrangler.local.jsonc --persist-to .wrangler/state && exec node scripts/run-framework.mjs dev --hostname 0.0.0.0"]
