# Imagem do vesti-cs-tier no Cloud Run. Contexto de build: CS/api-tier/
#   docker build -f deploy/gcp/vesti-cs-tier/Dockerfile CS/api-tier
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY api ./api
COPY server.mjs ./

USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
