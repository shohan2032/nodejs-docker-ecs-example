# Stage 1: Builder
FROM node:18-alpine AS builder

WORKDIR /build

COPY package*.json ./
RUN npm install --production=false

COPY src/ src/
COPY tsconfig.json ./

RUN npm run build


# Stage 2: Runner
FROM node:18-alpine AS runner

WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /build/package*.json ./
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist

EXPOSE 80

CMD ["npm", "start"]
