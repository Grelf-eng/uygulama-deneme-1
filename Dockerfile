FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y python3 make g++ sqlite3 ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# tsx aracını doğrudan kur (derleme aşamasına gerek duymadan TypeScript'i anında çalıştırır)
RUN npm install -g tsx typescript

COPY . .

# backend klasörü varsa oraya, yoksa ana dizine bağımlılıkları kur
RUN if [ -f "backend/package.json" ]; then \
      cd backend && npm install; \
    else \
      npm install; \
    fi

ENV NODE_ENV=production
ENV PORT=10000
ENV SEED_SAMPLE=true

EXPOSE 10000

# src/index.ts dosyasını doğrudan başlatır (dist/ aramaz, asla modül bulunamadı demez)
CMD ["sh", "-c", "if [ -f 'backend/src/index.ts' ]; then cd backend && tsx src/index.ts; else tsx src/index.ts; fi"]
