# Multi-stage production image for Quizzer (official Node images from Docker Hub)
# Serves Express + Socket.IO API and the built React client on port 8080.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
ENV NX_DAEMON=false
RUN npx nx run-many -t build --projects=web,server

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV STATIC_DIR=/app/public

RUN addgroup -S quizzer && adduser -S quizzer -G quizzer

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist/apps/server/main.js ./main.js
COPY --from=build /app/dist/apps/web ./public

USER quizzer
EXPOSE 8080
CMD ["node", "main.js"]
