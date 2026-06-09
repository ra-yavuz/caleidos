# caleiDOS - development image with hot reload.
FROM oven/bun:1

# Create a runtime user matching the HOST user's uid/gid. docker-compose bind
# mounts the project into /app, so files the app (and the agent) create in /app
# must be owned by an id the container user can write to. Bind-mount ownership
# comes from the host, so the container user must share the host uid/gid.
# UID/GID are passed by docker-compose (defaulting to the common Linux 1000).
# The base image (oven/bun, Debian-slim) ships useradd but not adduser, and
# already has a `bun` user at 1000:1000; reuse it when the requested id exists,
# otherwise create a fresh `caleidos` user. Either way the app runs as
# ${UID}:${GID} with HOME=/home/caleidos.
ARG UID=1000
ARG GID=1000
RUN set -eux; \
    if ! getent group "${GID}" >/dev/null; then groupadd --gid "${GID}" caleidos; fi; \
    if getent passwd "${UID}" >/dev/null; then \
        existing="$(getent passwd "${UID}" | cut -d: -f1)"; \
        usermod --gid "${GID}" --home /home/caleidos "${existing}"; \
    else \
        useradd --uid "${UID}" --gid "${GID}" --home-dir /home/caleidos caleidos; \
    fi; \
    mkdir -p /home/caleidos/.claude; \
    chown -R "${UID}:${GID}" /home/caleidos

WORKDIR /app

# Install dependencies first for layer caching.
COPY package.json bun.lock* ./
RUN bun install

# Expose the `claude` CLI. The agent SDK ships its own full Claude Code binary
# (the platform-specific @anthropic-ai/claude-agent-sdk-<plat> optional dep) and
# query() spawns it; that same binary is what `auth login` authenticates. node_modules
# is shadowed by an anonymous volume at runtime, so symlink into /usr/local/bin
# (outside the volume, on PATH for every shell incl. interactive bash) rather than
# node_modules/.bin. Pick whichever platform build bun installed.
# oven/bun is Debian (glibc), so pick the glibc build (linux-<arch>), NOT the
# -musl one (that targets Alpine and fails with "required file not found" under
# glibc). Match the exact glibc dir for this arch and fail loudly if absent.
RUN set -eux; \
    bin="$(ls -1d /app/node_modules/@anthropic-ai/claude-agent-sdk-linux-*/ 2>/dev/null \
            | grep -v -- '-musl/' | head -n1)claude"; \
    test -x "$bin"; \
    ln -sf "$bin" /usr/local/bin/claude

# Re-declare args (ARG scope ends at the previous stage boundary) and copy the
# rest of the source with correct ownership.
ARG UID=1000
ARG GID=1000
COPY --chown=${UID}:${GID} . .
RUN chown -R ${UID}:${GID} /app

# Run as the matched non-root user (may be the reused `bun` account, so use the
# numeric id rather than a name).
USER ${UID}:${GID}

# HOME for credentials/state, and the local CLIs on PATH so
# `claude auth login` is runnable directly inside the container.
ENV HOME=/home/caleidos
ENV PATH=/app/node_modules/.bin:$PATH
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

CMD ["bun", "run", "dev"]
