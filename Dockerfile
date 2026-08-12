FROM node:22-alpine AS builder
ARG VERSION=dev
ENV PUBLIC_HELI_VERSION=$VERSION
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# Source maps are ~2x the size of the server bundle they describe, and `node`
# only reads them with --enable-source-maps, which the CMD below does not pass.
# So in the image they are pure pull weight. They are still produced by the
# build, so a local `npm run build` can still be debugged.
RUN find build -name '*.js.map' -delete
# Everything the server actually imports at runtime is asserted by
# scripts/check-externals.ts during `npm run build`, so this prune cannot
# silently remove something the bundle still needs.
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
