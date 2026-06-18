import { config } from './config.js';

const token = config.telegramBotToken;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || `${config.webAppUrl.replace(/\/+$/, '')}/telegram/webhook`;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set.');
  process.exit(1);
}

if (!webhookUrl.startsWith('https://')) {
  console.error('Telegram webhook URL must start with https://');
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query']
  })
});

const data = await response.json();
if (!data.ok) {
  console.error(data.description || 'Failed to set Telegram webhook.');
  process.exit(1);
}

console.log(`Telegram webhook set: ${webhookUrl}`);
