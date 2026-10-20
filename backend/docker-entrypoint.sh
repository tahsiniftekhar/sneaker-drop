#!/bin/sh
set -e

case "${1:-start}" in
  start)
    if [ "$MIGRATE_ON_START" = "true" ]; then
      node_modules/.bin/sequelize-cli db:migrate
    fi
    exec node server.js
    ;;
  migrate)
    exec node_modules/.bin/sequelize-cli db:migrate
    ;;
  reset)
    shift
    exec node scripts/reset-demo.js "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
