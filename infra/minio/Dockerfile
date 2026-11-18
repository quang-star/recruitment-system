FROM busybox:1.37.0-musl AS healthcheck
FROM cgr.dev/chainguard/minio:latest
USER 0:0
COPY --from=healthcheck /bin/busybox /usr/local/bin/busybox
RUN ["/usr/local/bin/busybox", "mkdir", "-p", "/data"]
RUN ["/usr/local/bin/busybox", "chown", "65532:65532", "/data"]
USER 65532:65532
