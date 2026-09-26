# ─── Etapa 1: compilar el cliente (three.js + Vite) ───────────────────────
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --no-audit --no-fund
COPY client client
RUN npm run build -w client

# ─── Etapa 2: imagen final (solo servidor + cliente compilado) ────────────
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/ai-world.db
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev --no-audit --no-fund -w server --include-workspace-root=false \
    && npm cache clean --force
COPY server server
COPY --from=build /app/client/dist client/dist

# La memoria del agente (SQLite) vive en un volumen para sobrevivir a reinicios
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
