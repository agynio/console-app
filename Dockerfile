# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 docker/40-generate-env.sh /docker-entrypoint.d/40-generate-env.sh

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3000
