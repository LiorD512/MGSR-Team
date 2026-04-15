FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# JOB_MODE is set by Cloud Run env vars: "player-refresh" or "releases-refresh"
CMD ["node", "run.js"]
