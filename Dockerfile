FROM node:22-alpine AS builder
ARG VERSION=dev
ENV PUBLIC_HELI_VERSION=$VERSION
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine
ARG VERSION=dev
ENV PUBLIC_HELI_VERSION=$VERSION
WORKDIR /app
COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY package.json .
EXPOSE 3000
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O- http://localhost:3000/api/health || exit 1
CMD ["node", "build/index.js"]
