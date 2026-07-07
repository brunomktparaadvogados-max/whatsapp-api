FROM node:20-bullseye-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=768"

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
