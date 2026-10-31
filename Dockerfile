# Web app
FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx vite build --outDir /out/app --emptyOutDir

# PHP dependencies
FROM composer:2 AS vendor
WORKDIR /app
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist --ignore-platform-reqs

FROM dunglas/frankenphp:1-php8.4
RUN install-php-extensions pdo_pgsql zip intl opcache
WORKDIR /app
COPY backend/ ./
COPY --from=vendor /app/vendor ./vendor
COPY --from=web /out/app ./public/app
COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN cp .env.example .env && php artisan package:discover --ansi && chmod +x /usr/local/bin/entrypoint \
    && mkdir -p storage/app/public bootstrap/cache && chown -R www-data:www-data storage bootstrap/cache
ENV APP_ENV=production APP_DEBUG=false LOG_CHANNEL=stderr
EXPOSE 8080
ENTRYPOINT ["entrypoint"]
CMD ["frankenphp", "php-server", "--root", "public/", "--listen", ":8080"]
