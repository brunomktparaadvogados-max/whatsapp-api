FROM alpine/git:2.47.2 AS source

ARG EVOLUTION_GO_COMMIT=9337afc
WORKDIR /src
RUN git clone https://github.com/EvolutionAPI/evolution-go.git .
RUN git checkout "${EVOLUTION_GO_COMMIT}"
COPY docker/evolution-go/shared-whatsmeow-store.patch /tmp/shared-whatsmeow-store.patch
COPY docker/evolution-go/stale-client-recovery.patch /tmp/stale-client-recovery.patch
COPY docker/evolution-go/whatsmeow-stability.patch /tmp/whatsmeow-stability.patch
RUN git apply --recount --check /tmp/shared-whatsmeow-store.patch \
    && git apply --recount /tmp/shared-whatsmeow-store.patch \
    && git apply --recount --check /tmp/stale-client-recovery.patch \
    && git apply --recount /tmp/stale-client-recovery.patch \
    && git apply --recount --check /tmp/whatsmeow-stability.patch \
    && git apply --recount /tmp/whatsmeow-stability.patch

FROM golang:1.26-alpine AS build

RUN apk add --no-cache build-base git libjpeg-turbo-dev libwebp-dev
WORKDIR /build
COPY --from=source /src/go.mod /src/go.sum ./
RUN go mod download
COPY --from=source /src/ ./
ARG VERSION=0.7.2-prospectflow.1
RUN CGO_ENABLED=1 go build -ldflags "-X main.version=${VERSION}" -o server ./cmd/evolution-go

FROM alpine:3.19.1 AS final

RUN apk add --no-cache tzdata ffmpeg libjpeg-turbo libwebp poppler-utils
WORKDIR /app
COPY --from=build /build/server .
COPY --from=build /build/manager/dist ./manager/dist
COPY --from=build /build/VERSION ./VERSION
ENV TZ=America/Sao_Paulo
ENTRYPOINT ["/app/server"]
