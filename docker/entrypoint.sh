#!/bin/sh
set -e
cd /app
grep -q '^APP_KEY=base64' .env || php artisan key:generate --force --no-interaction
php artisan storage:link --force >/dev/null 2>&1 || true
if [ "$RUN_MIGRATIONS" != "false" ]; then
  php artisan migrate --force --no-interaction
  # Demo data on an empty database only.
  if [ "$SEED_DEMO" = "true" ] && [ "$(php artisan tinker --execute='echo App\Models\User::count();' 2>/dev/null)" = "0" ]; then
    php artisan db:seed --force --no-interaction
  fi
fi
php artisan config:cache >/dev/null && php artisan route:cache >/dev/null
exec "$@"
