# 诗云 Poetry Cloud — multi-stage Docker build
# Stage 1: Build frontend (Vite + React)
FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build Go backend
FROM golang:1.24-alpine AS backend
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server ./cmd/server/

# Stage 3: Runtime
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=backend /app/server .
COPY --from=frontend /app/dist ./dist
EXPOSE 8080
ENV PORT=8080 \
    SHIYUN_DATA_DIR=/app/data
VOLUME ["/app/data"]
CMD ["./server"]
