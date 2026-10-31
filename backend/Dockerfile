FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y python3 make g++ sqlite3 ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . ./
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000
ENV SEED_SAMPLE=true

EXPOSE 4000

CMD ["node", "dist/index.js"]
