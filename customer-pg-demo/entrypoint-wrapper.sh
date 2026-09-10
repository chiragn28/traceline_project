#!/bin/bash
set -e

# The csvlog directory is a separate named volume (deliberately not nested
# under PGDATA -- see docker-compose.yml comment). Docker creates fresh
# named volumes as root-owned, but Postgres runs as the "postgres" user, so
# it needs this chowned before the real entrypoint starts the server.
mkdir -p /var/log/postgresql
chown postgres:postgres /var/log/postgresql

exec docker-entrypoint.sh "$@"
