FROM golang:1.25-alpine AS builder
WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o backend .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates curl

WORKDIR /app
COPY --from=builder /build/backend /usr/local/bin/backend

ENV HTTP_ADDR=:8080
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/backend"]
