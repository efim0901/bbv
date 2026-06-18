  import { setTimeout as delay } from 'node:timers/promises';
  import { fileURLToPath } from 'node:url';
  import { resolve } from 'node:path';
  import { config } from './config.js';
  import { saveImageBuffer } from './storage.js';

  const token = config.telegramBotToken;
  const sessions = new Map();

  // ── Telegram API ──
  function assertTelegramToken() {
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  }

  async function telegram(method, payload = {}) {
    assertTelegramToken();
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.description || `Telegram method failed: ${method}`);
    return data.result;
  }

  // ── Backend API ──
  async function api(path, options = {}) {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Backend request failed: ${path}`);
    return data;
  }

  // ── Keyboards ──
  function mainKeyboard() {
    const keyboard = [
      [{ text: '📋 Смотреть объявления' }, { text: '➕ Подать объявление' }],
      [{ text: '🔍 Поиск' }, { text: '📦 Мои объявления' }]
    ];
    if (config.webAppUrl && config.webAppUrl.startsWith('https://')) {
      keyboard.push([{ text: '🌐 Открыть сайт', web_app: { url: config.webAppUrl } }]);
    }
    return { keyboard, resize_keyboard: true, one_time_keyboard: false };
  }

  function cancelKeyboard() {
    return { keyboard: [[{ text: '❌ Отмена' }]], resize_keyboard: true, one_time_keyboard: true };
  }

  function inlineKeyboard(rows) {
    return { inline_keyboard: rows };
  }

  // ── Formatting ──
  function formatPrice(listing) {
    return `${listing.price.toLocaleString('ru-RU')} ${listing.currency}`;
  }

  function formatListing(listing, index = null) {
    const num = index !== null ? `${index}. ` : '';
    const title = `${num}📌 <b>${esc(listing.title)}</b>`;
    const price = `💰 ${formatPrice(listing)}`;
    const cat = listing.category ? `\n📂 ${esc(listing.category.name)}` : '';
    const city = listing.city ? `\n📍 ${esc(listing.city)}` : '';
    const views = listing.views !== undefined ? `\n👁 ${listing.views}` : '';
    const desc = listing.description ? `\n\n${esc(listing.description.slice(0, 300))}${listing.description.length > 300
  ? '...' : ''}` : '';
    const seller = listing.seller?.phone ? `\n\n📞 ${esc(listing.seller.phone)}` : '';
    return `${title}\n${price}${cat}${city}${views}${desc}${seller}`;
  }

  function formatShortCard(listing, index) {
    const cat = listing.category ? ` | ${esc(listing.category.name)}` : '';
    const city = listing.city ? ` | 📍${esc(listing.city)}` : '';
    return `${index}. <b>${esc(listing.title)}</b> — ${formatPrice(listing)}${cat}${city}`;
  }

  function esc(text) {
    return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Utils ──
  function normalizeImageUrl(text) {
    const value = text.trim();
    if (!value || /^пропустить$/i.test(value)) return null;
    try {
      const url = new URL(value);
      const googleImageUrl = url.searchParams.get('imgurl');
      if (googleImageUrl) return googleImageUrl;
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch { return null; }
    return null;
  }

  async function saveTelegramPhoto(fileId, fallbackFileName = 'telegram-photo.jpg', mimeType = 'image/jpeg') {
    const file = await telegram('getFile', { file_id: fileId });
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!response.ok) throw new Error('Не удалось скачать фото из Telegram.');
    const buffer = Buffer.from(await response.arrayBuffer());
    return saveImageBuffer({ buffer, fileName: file.file_path || fallbackFileName, mimeType });
  }

  async function imageUrlsFromMessage(message) {
    const urls = [];
    if (message.photo?.length) {
      const biggest = message.photo.at(-1);
      urls.push(await saveTelegramPhoto(biggest.file_id));
    } else if (message.document?.mime_type?.startsWith('image/')) {
      urls.push(await saveTelegramPhoto(message.document.file_id, message.document.file_name || 'image',
  message.document.mime_type));
    }
    return urls;
  }

  async function downloadAndSaveUrl(imageUrl) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Не удалось загрузить изображение по ссылке.');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    return saveImageBuffer({ buffer, fileName: 'linked-image', mimeType });
  }

  async function ensureTelegramUser(from) {
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Telegram user';
    const data = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ name, telegramId: String(from.id) })
    });
    return data.user;
  }

  async function sendMessage(chatId, text, extra = {}) {
    return telegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
  }

  // ── Commands ──
  async function cmdStart(chatId, from) {
    await ensureTelegramUser(from);
    sessions.delete(chatId);
    await sendMessage(chatId, '👋 Добро пожаловать в Market Hub!\n\nЗдесь можно смотреть объявления или подать новое.
  Всё синхронизируется с сайтом.', {
      reply_markup: mainKeyboard()
    });
  }

  async function cmdHelp(chatId) {
    await sendMessage(chatId, `📖 <b>Справка по боту</b>

  <b>Основные команды:</b>
  /start — Начать работу
  /help — Эта справка
  /browse — Смотреть объявления
  /search — Поиск по ключевым словам
  /sell — Подать объявление
  /mylistings — Мои объявления

  <b>Во время подачи:</b>
  /cancel — Отменить создание

  <b>Навигация:</b>
  Используйте кнопки внизу экрана.
  На сайте и в боте — одна база объявлений.`, {
      reply_markup: mainKeyboard()
    });
  }

  async function cmdBrowse(chatId, page = 0) {
    const limit = 5;
    try {
      const data = await api(`/api/listings?limit=${limit}&offset=${page * limit}&sort=newest`);
      if (!data.items.length) {
        await sendMessage(chatId, '😕 Объявлений пока нет. Можно стать первым продавцом!');
        return;
      }
      await sendMessage(chatId, `📋 <b>Объявления</b> (стр. ${page + 1}/${Math.ceil(data.total / limit) || 1}, всего:
  ${data.total})`);
      for (let i = 0; i < data.items.length; i++) {
        const listing = data.items[i];
        const globalIndex = page * limit + i + 1;
        await sendMessage(chatId, formatListing(listing, globalIndex), {
          reply_markup: inlineKeyboard([[
            { text: '❤️ В избранное', callback_data: `fav:${listing.id}` },
            { text: '📞 Контакты', callback_data: `contact:${listing.id}` }
          ]])
        });
      }

      // Pagination
      const navButtons = [];
      if (page > 0) navButtons.push({ text: '⬅️ Назад', callback_data: `page:${page - 1}` });
      if (data.hasMore) navButtons.push({ text: 'Вперёд ➡️', callback_data: `page:${page + 1}` });
      if (navButtons.length) {
        await sendMessage(chatId, 'Навигация:', { reply_markup: inlineKeyboard([navButtons]) });
      }
    } catch (error) {
      await sendMessage(chatId, `Ошибка: ${error.message}`);
    }
  }

  async function cmdSearch(chatId, query = '', page = 0) {
    const session = sessions.get(chatId);
    if (!query) {
      sessions.set(chatId, { step: 'search_query' });
      await sendMessage(chatId, '🔍 Введите поисковый запрос:', { reply_markup: cancelKeyboard() });
      return;
    }

    const limit = 5;
    try {
      const data = await api(`/api/listings?limit=${limit}&offset=${page * limit}&q=${encodeURIComponent(query)}`);
      if (!data.items.length) {
        await sendMessage(chatId, `😕 По запросу "${esc(query)}" ничего не найдено.`);
        return;
      }
      await sendMessage(chatId, `🔍 <b>Результаты</b> по "${esc(query)}" (стр. ${page + 1}, найдено: ${data.total})`);
      for (const listing of data.items) {
        await sendMessage(chatId, formatListing(listing), {
          reply_markup: inlineKeyboard([[
            { text: '❤️ В избранное', callback_data: `fav:${listing.id}` }
          ]])
        });
      }

      const navButtons = [];
      if (page > 0) navButtons.push({ text: '⬅️', callback_data: `sp:${page - 1}:${encodeURIComponent(query)}` });
      if (data.hasMore) navButtons.push({ text: '➡️', callback_data: `sp:${page + 1}:${encodeURIComponent(query)}` });
      if (navButtons.length) {
        await sendMessage(chatId, 'Навигация:', { reply_markup: inlineKeyboard([navButtons]) });
      }
    } catch (error) {
      await sendMessage(chatId, `Ошибка: ${error.message}`);
    }
  }

  async function cmdMyListings(chatId, from, page = 0) {
    try {
      const user = await ensureTelegramUser(from);
      const data = await api(`/api/users/${user.id}/listings?limit=5&offset=${page * 5}`);
      if (!data.items.length) {
        await sendMessage(chatId, '📦 У вас пока нет объявлений. Нажмите «➕ Подать объявление».', { reply_markup:
  mainKeyboard() });
        return;
      }
      await sendMessage(chatId, `📦 <b>Ваши объявления</b> (стр. ${page + 1}, всего: ${data.total})`);
      for (const listing of data.items) {
        await sendMessage(chatId, formatListing(listing, null), {
          reply_markup: inlineKeyboard([[
            { text: '✏️ Изменить', callback_data: `edit:${listing.id}` },
            { text: '🗑 Удалить', callback_data: `del:${listing.id}` }
          ]])
        });
      }
      const navButtons = [];
      if (page > 0) navButtons.push({ text: '⬅️', callback_data: `myp:${page - 1}` });
      if (data.hasMore) navButtons.push({ text: '➡️', callback_data: `myp:${page + 1}` });
      if (navButtons.length) {
        await sendMessage(chatId, 'Навигация:', { reply_markup: inlineKeyboard([navButtons]) });
      }
    } catch (error) {
      await sendMessage(chatId, `Ошибка: ${error.message}`);
    }
  }

  // ── Sell flow ──
  async function beginSell(chatId, from) {
    const user = await ensureTelegramUser(from);
    sessions.set(chatId, { step: 'sell_title', sellerId: user.id, draft: {} });
    await sendMessage(chatId, '➕ <b>Новое объявление</b>\n\n📌 Введите название объявления.\nНапример: iPhone 13 128
  GB', {
      reply_markup: cancelKeyboard()
    });
  }

  async function sendCategoryPicker(chatId) {
    try {
      const data = await api('/api/categories');
      const categories = data.categories.filter(c => c.parentId);
      const rows = [];
      for (let i = 0; i < categories.length; i += 2) {
        rows.push(categories.slice(i, i + 2).map(c => ({
          text: c.name,
          callback_data: `sellcat:${c.id}`
        })));
      }
      await sendMessage(chatId, '📂 Выберите категорию:', {
        reply_markup: inlineKeyboard(rows)
      });
    } catch (error) {
      await sendMessage(chatId, `Ошибка загрузки категорий: ${error.message}`);
    }
  }

  async function handleSellStep(chatId, message, session) {
    const text = (message.text || '').trim();

    if (text === '/cancel' || text === '❌ Отмена') {
      sessions.delete(chatId);
      await sendMessage(chatId, '❌ Подача объявления отменена.', { reply_markup: mainKeyboard() });
      return;
    }

    switch (session.step) {
      case 'sell_title': {
        if (text.length < 3) { await sendMessage(chatId, 'Слишком короткое название. Введите минимум 3 символа.');
  return; }
        session.draft.title = text;
        session.step = 'sell_price';
        await sendMessage(chatId, '💰 Введите цену числом (в BYN):', { reply_markup: cancelKeyboard() });
        break;
      }
      case 'sell_price': {
        const price = Number(text.replace(',', '.').replace(/\s/g, ''));
        if (!Number.isFinite(price) || price < 0) { await sendMessage(chatId, 'Цена должна быть числом больше 0.');
  return; }
        session.draft.price = Math.round(price);
        session.step = 'sell_category';
        await sendCategoryPicker(chatId);
        break;
      }
      case 'sell_city': {
        session.draft.city = text;
        session.step = 'sell_description';
        await sendMessage(chatId, '📝 Добавьте описание: состояние, комплект, важные детали.', { reply_markup:
  cancelKeyboard() });
        break;
      }
      case 'sell_description': {
        if (text.length < 10) { await sendMessage(chatId, 'Слишком короткое описание. Минимум 10 символов.'); return; }
        session.draft.description = text;
        session.step = 'sell_images';
        await sendMessage(chatId, '📸 Пришлите фото (до 10 штук) или напишите «пропустить».\nМожно отправить несколько
  фото за раз.', {
          reply_markup: { keyboard: [[{ text: '⏭ Пропустить' }], [{ text: '❌ Отмена' }]], resize_keyboard: true }
        });
        break;
      }
      case 'sell_images': {
        const uploadedUrls = await imageUrlsFromMessage(message);
        const linkedUrl = normalizeImageUrl(text);
        const skip = /^пропустить$/i.test(text) || text === '⏭ Пропустить';

        if (uploadedUrls.length) {
          session.draft.imageUrls = [...(session.draft.imageUrls || []), ...uploadedUrls].slice(0, 10);
          const count = session.draft.imageUrls.length;
          if (count >= 10) {
            await publishListing(chatId, session);
          } else {
            await sendMessage(chatId, `✅ Фото добавлено (${count}/10). Пришлите ещё или «опубликовать».`, {
              reply_markup: { keyboard: [[{ text: '✅ Опубликовать' }], [{ text: '❌ Отмена' }]], resize_keyboard: true
  }
            });
          }
          return;
        }

        if (linkedUrl) {
          try {
            const savedUrl = await downloadAndSaveUrl(linkedUrl);
            session.draft.imageUrls = [...(session.draft.imageUrls || []), savedUrl].slice(0, 10);
            await sendMessage(chatId, `✅ Фото добавлено (${session.draft.imageUrls.length}/10). Пришлите ещё или
  «опубликовать».`, {
              reply_markup: { keyboard: [[{ text: '✅ Опубликовать' }], [{ text: '❌ Отмена' }]], resize_keyboard: true
  }
            });
          } catch {
            await sendMessage(chatId, 'Не удалось загрузить фото по ссылке. Попробуйте другую или «пропустить».');
          }
          return;
        }

        if (skip || text === '✅ Опубликовать') {
          await publishListing(chatId, session);
          return;
        }

        await sendMessage(chatId, '📸 Пришлите фото, ссылку на фото или напишите «пропустить».');
        break;
      }
    }
  }

  async function publishListing(chatId, session) {
    try {
      const data = await api('/api/listings', {
        method: 'POST',
        body: JSON.stringify({
          sellerId: session.sellerId,
          title: session.draft.title,
          description: session.draft.description,
          price: session.draft.price,
          categoryId: session.draft.categoryId,
          city: session.draft.city,
          imageUrls: session.draft.imageUrls || []
        })
      });
      sessions.delete(chatId);
      await sendMessage(chatId, `✅ <b>Объявление опубликовано!</b>\n\n${formatListing(data.listing)}`, {
        reply_markup: mainKeyboard()
      });
    } catch (error) {
      sessions.delete(chatId);
      await sendMessage(chatId, `❌ Ошибка публикации: ${error.message}`, { reply_markup: mainKeyboard() });
    }
  }

  // ── Callback handler ──
  async function handleCallback(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const from = callbackQuery.from;
    const data = callbackQuery.data || '';

    try {
      if (data.startsWith('page:')) {
        const page = Number(data.split(':')[1]);
        await cmdBrowse(chatId, page);
      } else if (data.startsWith('sp:')) {
        const [, page, query] = data.split(':');
        await cmdSearch(chatId, decodeURIComponent(query), Number(page));
      } else if (data.startsWith('myp:')) {
        const page = Number(data.split(':')[1]);
        await cmdMyListings(chatId, from, page);
      } else if (data.startsWith('fav:')) {
        const listingId = Number(data.split(':')[1]);
        const user = await ensureTelegramUser(from);
        await api('/api/favorites', {
          method: 'POST',
          body: JSON.stringify({ userId: user.id, listingId })
        });
        await telegram('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: '❤️ Добавлено в избранное!'
  });
        return;
      } else if (data.startsWith('contact:')) {
        const listingId = Number(data.split(':')[1]);
        const listingData = await api(`/api/listings/${listingId}`);
        const l = listingData.listing;
        const contact = l.seller?.phone ? `📞 ${l.seller.phone}` : '📞 Телефон не указан';
        await telegram('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: contact, show_alert: true });
        return;
      } else if (data.startsWith('del:')) {
        const listingId = Number(data.split(':')[1]);
        await api(`/api/listings/${listingId}`, { method: 'DELETE' });
        await telegram('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: '🗑 Объявление удалено.' });
        return;
      } else if (data.startsWith('edit:')) {
        const listingId = Number(data.split(':')[1]);
        const listingData = await api(`/api/listings/${listingId}`);
        const l = listingData.listing;
        const user = await ensureTelegramUser(from);
        if (l.seller.id !== user.id) {
          await telegram('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: '⚠️ Это не ваше
  объявление.' });
          return;
        }
        sessions.set(chatId, {
          step: 'edit_field',
          listingId: l.id,
          draft: { ...l }
        });
        await sendMessage(chatId, `✏️ <b>Редактирование:</b> ${esc(l.title)}\n\nЧто изменить?`, {
          reply_markup: inlineKeyboard([
            [{ text: '📌 Название', callback_data: `efield:title:${listingId}` }],
            [{ text: '💰 Цена', callback_data: `efield:price:${listingId}` }],
            [{ text: '📝 Описание', callback_data: `efield:description:${listingId}` }],
            [{ text: '📍 Город', callback_data: `efield:city:${listingId}` }],
            [{ text: '📂 Категория', callback_data: `efield:category:${listingId}` }],
            [{ text: '❌ Отмена', callback_data: `efield:cancel:${listingId}` }]
          ])
        });
        return;
      } else if (data.startsWith('efield:')) {
        const [, field, listingId] = data.split(':');
        if (field === 'cancel') {
          sessions.delete(chatId);
          await sendMessage(chatId, '❌ Редактирование отменено.', { reply_markup: mainKeyboard() });
          return;
        }
        const session = sessions.get(chatId);
        if (!session) return;
        session.step = `edit_value_${field}`;
        const prompts = {
          title: '📌 Введите новое название:',
          price: '💰 Введите новую цену:',
          description: '📝 Введите новое описание:',
          city: '📍 Введите новый город:',
          category: 'category' // special
        };
        if (field === 'category') {
          await sendCategoryPicker(chatId);
          session.step = 'edit_value_category';
        } else {
          await sendMessage(chatId, prompts[field], { reply_markup: cancelKeyboard() });
        }
        return;
      } else if (data.startsWith('sellcat:')) {
        const session = sessions.get(chatId);
        if (!session || !['sell_category', 'edit_value_category'].includes(session.step)) {
          await telegram('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: '⚠️ Эта кнопка уже не
  актуальна.' });
          return;
        }
        session.draft.categoryId = Number(data.split(':')[1]);
        if (session.step === 'edit_value_category') {
          // Save edit
          await api(`/api/listings/${session.listingId}`, {
            method: 'PATCH',
            body: JSON.stringify({ categoryId: session.draft.categoryId })
          });
          sessions.delete(chatId);
          await sendMessage(chatId, '✅ Категория обновлена!', { reply_markup: mainKeyboard() });
        } else {
          session.step = 'sell_city';
          await sendMessage(chatId, '📍 Укажите город или район:', { reply_markup: cancelKeyboard() });
        }
        return;
      }

      await telegram('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: '⚠️ Неизвестная команда.' });
    } catch (error) {
      await telegram('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: `❌ ${error.message}` });
    }
  }

  // ── Edit value handler ──
  async function handleEditValue(chatId, text, session) {
    const field = session.step.replace('edit_value_', '');
    const updates = {};

    switch (field) {
      case 'title':
        if (text.length < 3) { await sendMessage(chatId, 'Слишком короткое название.'); return; }
        updates.title = text;
        break;
      case 'price': {
        const price = Number(text.replace(',', '.').replace(/\s/g, ''));
        if (!Number.isFinite(price) || price < 0) { await sendMessage(chatId, 'Цена должна быть числом.'); return; }
        updates.price = Math.round(price);
        break;
      }
      case 'description':
        if (text.length < 10) { await sendMessage(chatId, 'Слишком короткое описание.'); return; }
        updates.description = text;
        break;
      case 'city':
        updates.city = text;
        break;
    }

    await api(`/api/listings/${session.listingId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    sessions.delete(chatId);
    await sendMessage(chatId, '✅ Объявление обновлено!', { reply_markup: mainKeyboard() });
  }

  // ── Message handler ──
  async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = (message.text || '').trim();
    const session = sessions.get(chatId);

    // Handle edit value input
    if (session?.step.startsWith('edit_value_')) {
      await handleEditValue(chatId, text, session);
      return;
    }

    // Handle search query input
    if (session?.step === 'search_query') {
      sessions.delete(chatId);
      await cmdSearch(chatId, text);
      return;
    }

    // Commands
    if (text === '/start') { await cmdStart(chatId, message.from); return; }
    if (text === '/help') { await cmdHelp(chatId); return; }
    if (text === '/browse' || text === '📋 Смотреть объявления') { await cmdBrowse(chatId); return; }
    if (text === '/search' || text === '🔍 Поиск') { await cmdSearch(chatId); return; }
    if (text === '/sell' || text === '➕ Подать объявление') { await beginSell(chatId, message.from); return; }
    if (text === '/mylistings' || text === '📦 Мои объявления') { await cmdMyListings(chatId, message.from); return; }

    // Sell flow
    if (session?.step?.startsWith('sell_')) {
      await handleSellStep(chatId, message, session);
      return;
    }

    await sendMessage(chatId, 'Выберите действие на клавиатуре или отправьте /help.', { reply_markup: mainKeyboard() });
  }

  // ── Polling ──
  export async function handleTelegramUpdate(update) {
    if (update.message) await handleMessage(update.message);
    if (update.callback_query) await handleCallback(update.callback_query);
  }

  export async function startBotPolling() {
    if (!token) {
      console.error('❌ TELEGRAM_BOT_TOKEN is not set.');
      process.exit(1);
    }

    let offset = 0;
    console.log('🤖 Telegram bot polling started.');

    while (true) {
      try {
        const updates = await telegram('getUpdates', {
          offset,
          timeout: 30,
          allowed_updates: ['message', 'callback_query']
        });

        for (const update of updates) {
          offset = update.update_id + 1;
          await handleTelegramUpdate(update);
        }
      } catch (error) {
        console.error('Bot error:', error.message);
        await delay(3000);
      }
    }
  }

  const currentFile = fileURLToPath(import.meta.url);
  if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
    startBotPolling();
  }
