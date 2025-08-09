# Stage 1: install dependencies using lockfile
FROM node:22.16.0 AS deps
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: build the app
FROM node:22.16.0 AS build
WORKDIR /usr/src/app
# Needed so npm can find scripts
COPY package.json package-lock.json ./
COPY tsconfig.json nest-cli.json ./
COPY src ./src
COPY --from=deps /usr/src/app/node_modules ./node_modules
RUN npm run build

# Stage 3: production image with only prod deps
FROM node:22.16.0 AS production
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
# Install only production dependencies according to lockfile
RUN npm ci --omit=dev
# Copy compiled dist
COPY --from=build /usr/src/app/dist ./dist

CMD ["node", "dist/main"]