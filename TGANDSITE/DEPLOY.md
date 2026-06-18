# Развёртывание Market Hub на сервере

Market Hub — один backend (Node.js), одна база данных, два клиента: сайт и Telegram-бот. Объявление, созданное в боте, сразу видно на сайте, и наоборот.

## Архитектура

```text
┌─────────────┐     ┌─────────────┐
│   Сайт      │     │ Telegram-бот│
│  (браузер)  │     │  (polling)  │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────────┬─────────┘
                 │ REST API
           ┌─────▼─────┐
           │  server.js │
           └─────┬─────┘
                 │
     ┌───────────┴───────────┐
     │                       │
 SQLite (файл)         Supabase (PostgreSQL)
 на VPS                облако или self-host
```

## Вариант 1 — Supabase (рекомендуется для продакшена)

PostgreSQL и хранилище картинок на сервере Supabase. Код уже поддерживает это без дополнительных npm-пакетов.

### Шаг 1. Создайте проект Supabase

1. Зайдите на [supabase.com](https://supabase.com) и создайте проект.
2. Дождитесь инициализации базы (1–2 минуты).

### Шаг 2. Примените схему БД

1. Откройте **SQL Editor** в панели Supabase.
2. Скопируйте содержимое файла `infra/supabase/schema.sql` и выполните.
3. Таблицы `users`, `categories`, `listings`, `images`, `favorites` и начальные категории появятся автоматически.

### Шаг 3. Настройте Storage для фото

1. **Storage → New bucket** → имя `listing-images`.
2. Включите **Public bucket** (картинки объявлений должны открываться по URL).
3. Политики доступа для MVP можно оставить через service role (backend загружает файлы от имени сервера).

### Шаг 4. Скопируйте ключи в `.env`

В **Project Settings → API**:

| Переменная | Откуда |
|------------|--------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (секретный, только на сервере!) |
| `SUPABASE_STORAGE_BUCKET` | `listing-images` |

```env
DATABASE_PROVIDER=supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=listing-images
```

> **Важно:** `service_role` никогда не попадает в браузер и не коммитится в git. Только в `.env` на сервере.

### Шаг 5. Запустите backend и бота

```bash
cp .env.example .env
# заполните .env

npm start          # API + сайт
npm run bot        # Telegram-бот (второй процесс)
```

Проверка: `GET /api/health` должен вернуть `"database": "supabase"`.

---

## Вариант 2 — VPS + SQLite (быстрый старт)

Подходит для небольшой нагрузки. База — один файл `data/marketplace.sqlite` на диске сервера.

### Docker Compose

```bash
git clone <ваш-репозиторий> /opt/tg-site-marketplace
cd /opt/tg-site-marketplace
cp .env.example .env
# TELEGRAM_BOT_TOKEN, WEB_APP_URL

docker compose up -d --build
```

Данные сохраняются в Docker-томах `marketplace-data` и `marketplace-uploads`.

### Без Docker (systemd)

```bash
# Node.js 24+
cd /opt/tg-site-marketplace
npm run check

sudo cp infra/systemd/marketplace-api.service /etc/systemd/system/
sudo cp infra/systemd/marketplace-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now marketplace-api marketplace-bot
```

### Резервное копирование SQLite

```bash
# Остановите API на время копии или используйте sqlite3 .backup
cp data/marketplace.sqlite backups/marketplace-$(date +%F).sqlite
```

---

## HTTPS и домен

Telegram Mini App (`WEB_APP_URL`) требует **HTTPS**.

1. Укажите A-запись домена на IP сервера.
2. Поставьте Nginx + Certbot:

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo cp infra/nginx/marketplace.conf.example /etc/nginx/sites-available/marketplace
# замените your-domain.example на свой домен
sudo ln -s /etc/nginx/sites-available/marketplace /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.example
```

3. Обновите `.env`:

```env
WEB_APP_URL=https://your-domain.example
API_BASE_URL=https://your-domain.example
```

4. Перезапустите API и бота.

---

## Telegram-бот в продакшене

| Режим | Когда использовать |
|-------|-------------------|
| **Webhook** | Рекомендуется для сервера: один HTTPS web service принимает сайт, API и Telegram updates |
| **Polling** (`npm run bot`) | Только локальная разработка или VPS с отдельным процессом |

### Webhook

После HTTPS backend уже содержит endpoint:

```text
POST /telegram/webhook
```

На сервере должны быть переменные:

```env
TELEGRAM_BOT_TOKEN=123456:token
WEB_APP_URL=https://your-domain.example
API_BASE_URL=https://your-domain.example
TELEGRAM_WEBHOOK_URL=https://your-domain.example/telegram/webhook
```

Зарегистрируйте webhook один раз:

```bash
npm run webhook:set
```

После этого отдельный `npm run bot` на сервере не нужен. Telegram будет сам отправлять updates на ваш HTTPS endpoint.

---

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `PORT` | Порт API и сайта (по умолчанию 3000) |
| `DATABASE_PROVIDER` | `auto`, `sqlite` или `supabase` |
| `MARKETPLACE_DB_PATH` | Путь к SQLite-файлу |
| `SUPABASE_URL` | URL проекта Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Секретный ключ сервера |
| `SUPABASE_STORAGE_BUCKET` | Имя bucket для фото |
| `TELEGRAM_BOT_TOKEN` | Токен от BotFather |
| `API_BASE_URL` | URL backend для бота |
| `WEB_APP_URL` | URL сайта (HTTPS для Mini App) |

---

## Чеклист перед запуском

- [ ] `.env` создан, секреты не в git
- [ ] Схема БД применена (Supabase) или SQLite создаётся автоматически
- [ ] `GET /api/health` → `ok: true`
- [ ] Объявление с сайта видно через `/api/listings`
- [ ] Бот отвечает на `/start` и публикует объявление
- [ ] HTTPS настроен для продакшена
- [ ] Настроено резервное копирование БД

---

## Ограничения MVP (что добавить дальше)

- **Авторизация** — сейчас любой может создавать/удалять объявления через API без проверки владельца.
- **Склейка аккаунтов** — Telegram Login Widget или JWT для сайта.
- **Webhook бота** — вместо polling для масштабирования.
- **Модерация** — статус `draft` до проверки админом.
