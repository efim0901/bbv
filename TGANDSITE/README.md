# Market Hub

MVP API-first маркетплейса, где сайт и Telegram-бот работают с одной базой данных через единый backend.

## Что уже есть

- Node.js backend без внешних npm-зависимостей.
- Единая SQLite-база для пользователей, категорий, объявлений, изображений и избранного.
- REST API для сайта и Telegram-бота.
- Статический веб-каталог с фильтрами и формой подачи объявления.
- Telegram-бот на polling через Telegram Bot API.
- Тесты базового пользовательского сценария.

## Запуск

Нужен Node.js 24 или новее.

```bash
npm run check
npm start
```

После запуска сайт и API будут доступны по адресу:

```text
http://localhost:3000
```

Основные API endpoints:

```text
GET    /api/health
GET    /api/categories
GET    /api/listings
POST   /api/listings
GET    /api/listings/:id
PATCH  /api/listings/:id
DELETE /api/listings/:id
POST   /api/uploads
POST   /api/users
POST   /api/favorites
DELETE /api/favorites?userId=1&listingId=1
GET    /api/users/:id/favorites
```

## Telegram-бот

1. Создайте бота в BotFather.
2. Скопируйте `.env.example` в `.env` или задайте переменные окружения.
3. Укажите токен:

```text
TELEGRAM_BOT_TOKEN=123456:token
API_BASE_URL=http://localhost:3000
WEB_APP_URL=http://localhost:3000
```

4. В одном терминале запустите backend:

```bash
npm start
```

5. Во втором терминале запустите бота:

```bash
npm run bot
```

Бот поддерживает команды `/start`, `/browse`, `/sell` и пошаговую подачу объявления. На шаге фото можно отправить обычную картинку, файл-изображение, ссылку на изображение или написать `пропустить`.

Для сервера предпочтительный режим — webhook:

```bash
npm run webhook:set
```

После регистрации webhook отдельный polling-процесс `npm run bot` на сервере не нужен.

В текущем MVP изображения сохраняются локально в `public/uploads`. Для боевого запуска лучше заменить это на S3-совместимое хранилище и сохранять публичные URL в таблицу `images`.

## База на сервере

Проект уже умеет работать с **Supabase (PostgreSQL + Storage)** — сайт и бот пишут в одну облачную БД.

1. Создайте проект на [supabase.com](https://supabase.com).
2. Выполните `infra/supabase/schema.sql` в SQL Editor.
3. Создайте public bucket `listing-images` в Storage.
4. Скопируйте `.env.example` → `.env` и укажите `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Подробная инструкция: **[DEPLOY.md](./DEPLOY.md)** (Docker, VPS, HTTPS, systemd, резервные копии).

Локально без Supabase используется SQLite в `data/marketplace.sqlite`.

## Производственный путь

Этот MVP намеренно сделан без фреймворков и внешних npm-пакетов. Для боевого запуска:

- Supabase или SQLite на VPS — см. [DEPLOY.md](./DEPLOY.md);
- добавить JWT или Telegram Login Widget для склейки аккаунтов сайта и бота;
- заменить polling бота на webhook после деплоя на HTTPS-домен;
- вынести frontend в Next.js, если нужен SEO-каталог.
