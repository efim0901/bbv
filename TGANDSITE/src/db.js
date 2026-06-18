
  import { DatabaseSync } from 'node:sqlite';
  import { dirname } from 'node:path';
  import { mkdirSync, readFileSync, existsSync } from 'node:fs';
  import { resolve } from 'node:path';
  import { config } from './config.js';
  import {
    ValidationError,
    cleanText,
    cleanInteger,
    cleanStatus,
    cleanCurrency
  } from './validate.js';

  if (config.dbPath !== ':memory:') {
    mkdirSync(dirname(config.dbPath), { recursive: true });
  }

  const db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');

  // ── Migrations ──
  function migrate() {
    const schemaPath = resolve(config.rootDir, 'data', 'schema.sql');
    if (existsSync(schemaPath)) {
      const sql = readFileSync(schemaPath, 'utf8');
      db.exec(sql);
    }
  }

  // ── Seed ──
  function seedCategories() {
    const count = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
    if (count > 0) return;

    const insert = db.prepare('INSERT INTO categories (name, slug, parent_id, sort_order) VALUES (?, ?, ?, ?)');
    const roots = [
      ['Электроника', 'electronics', 0],
      ['Авто и мото', 'auto', 1],
      ['Дом и ремонт', 'home-repair', 2],
      ['Одежда', 'clothing', 3],
      ['Спорт и отдых', 'sports', 4],
      ['Детские товары', 'kids', 5],
      ['Услуги', 'services', 6]
    ];

    db.exec('BEGIN');
    try {
      const rootIds = new Map();
      for (const [name, slug, order] of roots) {
        const result = insert.run(name, slug, null, order);
        rootIds.set(slug, Number(result.lastInsertRowid));
      }

      const children = [
        ['Мобильные телефоны', 'mobile-phones', 'electronics', 0],
        ['Компьютеры и комплектующие', 'computers-parts', 'electronics', 1],
        ['Ремонт техники', 'device-repair', 'electronics', 2],
        ['Аудио и видео', 'audio-video', 'electronics', 3],
        ['Запчасти', 'auto-parts', 'auto', 0],
        ['Шины и диски', 'tires-wheels', 'auto', 1],
        ['Автоэлектроника', 'auto-electronics', 'auto', 2],
        ['Инструменты', 'tools', 'home-repair', 0],
        ['Мебель', 'furniture', 'home-repair', 1],
        ['Сантехника', 'plumbing', 'home-repair', 2],
        ['Мужская одежда', 'mens-clothing', 'clothing', 0],
        ['Женская одежда', 'womens-clothing', 'clothing', 1],
        ['Обувь', 'shoes', 'clothing', 2],
        ['Фитнес', 'fitness', 'sports', 0],
        ['Туризм', 'tourism', 'sports', 1],
        ['Коляски', 'strollers', 'kids', 0],
        ['Игрушки', 'toys', 'kids', 1],
        ['Ремонт и стройка', 'repair-services', 'services', 0],
        ['IT-услуги', 'it-services', 'services', 1]
      ];

      for (const [name, slug, parentSlug, order] of children) {
        insert.run(name, slug, rootIds.get(parentSlug), order);
      }

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function seedListings() {
    const count = db.prepare('SELECT COUNT(*) AS count FROM listings').get().count;
    if (count > 0) return;

    const user = createUser({ name: 'Тестовый продавец', phone: '+375291234567', telegramId: 'seed_1' });
    const categories = getCategories().filter(c => c.parentId);

    const sampleListings = [
      { title: 'iPhone 15 Pro 256GB', desc: 'Полный комплект, идеальное состояние. Куплен в официальном магазине.',
  price: 3200, city: 'Минск', catSlug: 'mobile-phones' },
      { title: 'MacBook Air M2 2022', desc: 'Ноутбук в отличном состоянии, без царапин. Зарядка в комплекте.', price:
  4500, city: 'Минск', catSlug: 'computers-parts' },
      { title: 'Samsung Galaxy S24', desc: 'Новый, запечатанный. Цвет: чёрный.', price: 2800, city: 'Гомель', catSlug:
  'mobile-phones' },
      { title: 'Комплект зимней резины Michelin', desc: '4 шины 225/55 R16, пробег 10 000 км. Отличное состояние.',
  price: 800, city: 'Брест', catSlug: 'tires-wheels' },
      { title: 'Дрель Bosch GSB 13 RE', desc: 'Профессиональная ударная дрель. Работает идеально.', price: 350, city:
  'Витебск', catSlug: 'tools' },
      { title: 'Диван угловой "Стокгольм"', desc: 'Прочная ткань, раскладной механизм. Самовывоз.', price: 1200, city:
  'Минск', catSlug: 'furniture' },
      { title: 'Куртка мужская The North Face', desc: 'Размер L, цвет тёмно-синий. Носил один сезон.', price: 280, city:
  'Гродно', catSlug: 'mens-clothing' },
      { title: 'Платье вечернее', desc: 'Размер S, цвет бордовое. Надевалось один раз.', price: 150, city: 'Минск',
  catSlug: 'womens-clothing' },
      { title: 'Велосипед горный Stels', desc: 'Алюминиевая рама, 21 скорость. Хорошее состояние.', price: 600, city:
  'Могилёв', catSlug: 'sports' },
      { title: 'Коляска Bugaboo Fox 3', desc: 'Комплект: люлька + прогулочный блок. Цвет: серый меланж.', price: 1800,
  city: 'Минск', catSlug: 'strollers' },
      { title: 'Ремонт смартфонов любой сложности', desc: 'Замена экрана, батареи, разъёма. Гарантия 30 дней.', price:
  50, city: 'Минск', catSlug: 'device-repair' },
      { title: 'Настройка ПК и установка Windows', desc: 'Установка ОС, драйверов, программ. Выезд на дом.', price: 40,
  city: 'Минск', catSlug: 'it-services' }
    ];

    for (const item of sampleListings) {
      const cat = categories.find(c => c.slug === item.catSlug);
      if (cat) {
        createListing({
          sellerId: user.id,
          categoryId: cat.id,
          title: item.title,
          description: item.desc,
          price: item.price,
          city: item.city,
          status: 'active'
        });
      }
    }
  }

  migrate();
  seedCategories();
  seedListings();

  // ── Helpers ──

  function getUserById(id) {
    return db.prepare(`
      SELECT id, name, phone, telegram_id AS telegramId, rating, created_at AS createdAt
      FROM users
      WHERE id = ?
    `).get(id) || null;
  }

  function getImagesForListing(listingId) {
    return db.prepare(`
      SELECT id, url, alt_text AS altText, sort_order AS sortOrder
      FROM images
      WHERE listing_id = ?
      ORDER BY sort_order, id
    `).all(listingId);
  }

  function mapListing(row) {
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description,
      price: row.price,
      currency: row.currency,
      status: row.status,
      city: row.city,
      views: row.views,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      seller: {
        id: row.sellerId,
        name: row.sellerName,
        phone: row.sellerPhone,
        telegramId: row.sellerTelegramId,
        rating: row.sellerRating
      },
      category: row.categoryId
        ? { id: row.categoryId, name: row.categoryName, slug: row.categorySlug, parentId: row.categoryParentId }
        : null,
      images: getImagesForListing(row.id)
    };
  }

  function listingSelectSql() {
    return `
      SELECT
        l.id, l.title, l.slug, l.description, l.price, l.currency, l.status, l.city, l.views,
        l.created_at AS createdAt, l.updated_at AS updatedAt,
        u.id AS sellerId, u.name AS sellerName, u.phone AS sellerPhone,
        u.telegram_id AS sellerTelegramId, u.rating AS sellerRating,
        c.id AS categoryId, c.name AS categoryName, c.slug AS categorySlug, c.parent_id AS categoryParentId
      FROM listings l
      JOIN users u ON u.id = l.seller_id
      LEFT JOIN categories c ON c.id = l.category_id
    `;
  }

  // ── Users ──

  export function createUser(input = {}) {
    const name = cleanText(input.name || input.username, 'name', { max: 120 });
    const phone = cleanText(input.phone, 'phone', { required: false, max: 40 });
    const telegramId = cleanText(input.telegramId || input.telegram_id, 'telegramId', { required: false, max: 80 });

    if (telegramId) {
      const existing = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(telegramId);
      if (existing) {
        db.prepare('UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?')
          .run(name, phone, existing.id);
        return getUserById(existing.id);
      }
    }

    const result = db.prepare('INSERT INTO users (name, phone, telegram_id) VALUES (?, ?, ?)')
      .run(name, phone, telegramId);
    return getUserById(Number(result.lastInsertRowid));
  }

  export function updateUser(id, input = {}) {
    const userId = cleanInteger(id, 'id', { min: 1 });
    const existing = getUserById(userId);
    if (!existing) throw new ValidationError('Пользователь не найден.', 404);

    const name = input.name !== undefined ? cleanText(input.name, 'name', { max: 120 }) : existing.name;
    const phone = input.phone !== undefined ? cleanText(input.phone, 'phone', { required: false, max: 40 }) :
  existing.phone;

    db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone, userId);
    return getUserById(userId);
  }

  export function getUserListings(userId, { limit = 24, offset = 0 } = {}) {
    const cleanUserId = cleanInteger(userId, 'userId', { min: 1 });
    const user = getUserById(cleanUserId);
    if (!user) throw new ValidationError('Пользователь не найден.', 404);

    const total = db.prepare(`SELECT COUNT(*) AS count FROM listings WHERE seller_id = ? AND status !=
  'deleted'`).get(cleanUserId).count;
    const rows = db.prepare(`${listingSelectSql()} WHERE l.seller_id = ? AND l.status != 'deleted' ORDER BY l.created_at
  DESC LIMIT ? OFFSET ?`)
      .all(cleanUserId, limit, offset);
    return { items: rows.map(mapListing), total, limit, offset, hasMore: offset + limit < total };
  }

  // ── Categories ──

  export function getCategories() {
    return db.prepare(`
      SELECT c.id, c.name, c.slug, c.parent_id AS parentId, c.sort_order AS sortOrder, p.name AS parentName
      FROM categories c
      LEFT JOIN categories p ON p.id = c.parent_id
      ORDER BY COALESCE(c.parent_id, c.id), c.parent_id IS NOT NULL, c.sort_order, c.name
    `).all();
  }

  // ── Listings ──

  function assertCategoryExists(categoryId) {
    if (!categoryId) return;
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
    if (!category) throw new ValidationError('Категория не найдена.', 404);
  }

  function assertUserExists(userId) {
    const user = getUserById(userId);
    if (!user) throw new ValidationError('Пользователь не найден.', 404);
    return user;
  }

  function replaceImages(listingId, imageUrls = []) {
    db.prepare('DELETE FROM images WHERE listing_id = ?').run(listingId);
    if (!Array.isArray(imageUrls)) return;
    const insert = db.prepare('INSERT INTO images (listing_id, url, alt_text, sort_order) VALUES (?, ?, ?, ?)');
    imageUrls
      .map(url => cleanText(url, 'imageUrl', { required: false, max: 2000 }))
      .filter(Boolean)
      .slice(0, 10)
      .forEach((url, index) => insert.run(listingId, url, null, index));
  }

  function buildListingQuery(filters = {}) {
    const where = ["l.status != 'deleted'"];
    const params = [];

    if (filters.status && filters.status !== 'all') {
      where.push('l.status = ?');
      params.push(cleanStatus(filters.status));
    } else if (!filters.status) {
      where.push("l.status = 'active'");
    }

    if (filters.categoryId) {
      const categoryId = cleanInteger(filters.categoryId, 'categoryId', { min: 1 });
      assertCategoryExists(categoryId);
      where.push(`l.category_id IN (
        WITH RECURSIVE descendants(id) AS (
          SELECT id FROM categories WHERE id = ?
          UNION ALL SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
        ) SELECT id FROM descendants
      )`);
      params.push(categoryId);
    }

    if (filters.q) {
      const query = cleanText(filters.q, 'q', { max: 120 });
      // Use FTS5 if available, fallback to LIKE
      where.push(`(l.title LIKE ? OR l.description LIKE ? OR l.city LIKE ?)`);
      const likeQuery = `%${query}%`;
      params.push(likeQuery, likeQuery, likeQuery);
    }

    if (filters.minPrice) { where.push('l.price >= ?'); params.push(cleanInteger(filters.minPrice, 'minPrice')); }
    if (filters.maxPrice) { where.push('l.price <= ?'); params.push(cleanInteger(filters.maxPrice, 'maxPrice')); }
    if (filters.city) { where.push('l.city LIKE ?'); params.push(`%${cleanText(filters.city, 'city', { max: 120 })}%`);
  }
    if (filters.sellerId) { where.push('l.seller_id = ?'); params.push(cleanInteger(filters.sellerId, 'sellerId', { min:
  1 })); }

    const sort = {
        newest: 'l.created_at DESC',
        price_asc: 'l.price ASC, l.created_at DESC',
        price_desc: 'l.price DESC, l.created_at DESC',
        popular: 'l.views DESC, l.created_at DESC'
      }[filters.sort || 'newest'] || 'l.created_at DESC';

    return { where, params, sort };
  }

  export function getListingById(id) {
    const listingId = cleanInteger(id, 'id', { min: 1 });
    const row = db.prepare(`${listingSelectSql()} WHERE l.id = ? AND l.status != 'deleted'`).get(listingId);
    if (row) {
      db.prepare('UPDATE listings SET views = views + 1 WHERE id = ?').run(listingId);
      row.views += 1;
    }
    return mapListing(row);
  }

  export function getListings(filters = {}) {
    const { where, params, sort } = buildListingQuery(filters);
    const limit = cleanInteger(filters.limit || 24, 'limit', { min: 1, max: 100 });
    const offset = cleanInteger(filters.offset || 0, 'offset', { min: 0 });
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const total = db.prepare(`SELECT COUNT(*) AS count FROM listings l ${whereSql}`).get(...params).count;
    const rows = db.prepare(`${listingSelectSql()} ${whereSql} ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...params, limit,
  offset);

    return { items: rows.map(mapListing), total, limit, offset, hasMore: offset + limit < total };
  }

  function resolveSeller(input) {
    if (input.sellerId) {
      const sellerId = cleanInteger(input.sellerId, 'sellerId', { min: 1 });
      return assertUserExists(sellerId);
    }
    if (input.user && typeof input.user === 'object') return createUser(input.user);
    if (input.sellerTelegramId) return createUser({ name: input.sellerName || 'Telegram user', phone: input.sellerPhone,
  telegramId: input.sellerTelegramId });
    return createUser({ name: input.sellerName || 'Продавец', phone: input.sellerPhone });
  }

  export function createListing(input = {}) {
    const seller = resolveSeller(input);
    const categoryId = cleanInteger(input.categoryId, 'categoryId', { required: false, min: 1 });
    assertCategoryExists(categoryId);
    const title = cleanText(input.title, 'title', { max: 140 });
    const description = cleanText(input.description, 'description', { max: 4000 });
    const price = cleanInteger(input.price, 'price', { min: 0, max: 1000000000 });
    const currency = cleanCurrency(input.currency);
    const status = cleanStatus(input.status || 'active');
    const city = cleanText(input.city, 'city', { required: false, max: 120 });

    db.exec('BEGIN');
    try {
      const result = db.prepare(`
        INSERT INTO listings (seller_id, category_id, title, description, price, currency, status, city)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(seller.id, categoryId, title, description, price, currency, status, city);
      const listingId = Number(result.lastInsertRowid);
      replaceImages(listingId, input.imageUrls || input.images || []);
      db.exec('COMMIT');
      return getListingById(listingId);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  export function updateListing(id, input = {}) {
    const listingId = cleanInteger(id, 'id', { min: 1 });
    const existing = db.prepare(`${listingSelectSql()} WHERE l.id = ?`).get(listingId);
    if (!existing) throw new ValidationError('Объявление не найдено.', 404);

    const next = {
      categoryId: input.categoryId === undefined ? (existing.categoryId || null) : cleanInteger(input.categoryId,
  'categoryId', { required: false, min: 1 }),
      title: input.title === undefined ? existing.title : cleanText(input.title, 'title', { max: 140 }),
      description: input.description === undefined ? existing.description : cleanText(input.description, 'description',
  { max: 4000 }),
      price: input.price === undefined ? existing.price : cleanInteger(input.price, 'price', { min: 0, max: 1000000000
  }),
      currency: input.currency === undefined ? existing.currency : cleanCurrency(input.currency),
      status: input.status === undefined ? existing.status : cleanStatus(input.status),
      city: input.city === undefined ? existing.city : cleanText(input.city, 'city', { required: false, max: 120 })
    };
    assertCategoryExists(next.categoryId);

    db.exec('BEGIN');
    try {
      db.prepare(`UPDATE listings SET category_id=?, title=?, description=?, price=?, currency=?, status=?, city=? WHERE
  id=?`)
        .run(next.categoryId, next.title, next.description, next.price, next.currency, next.status, next.city,
  listingId);
      if (input.imageUrls || input.images) replaceImages(listingId, input.imageUrls || input.images);
      db.exec('COMMIT');
      return getListingById(listingId);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  export function deleteListing(id) {
    const listingId = cleanInteger(id, 'id', { min: 1 });
    // Soft delete
     const result = db.prepare("UPDATE listings SET status='deleted' WHERE id = ? AND status != 'deleted'").run(listingId);
    if (result.changes === 0) throw new ValidationError('Объявление не найдено.', 404);
    return { ok: true };
  }

  // ── Favorites ──

  export function addFavorite(userId, listingId) {
    const cleanUserId = cleanInteger(userId, 'userId', { min: 1 });
    const cleanListingId = cleanInteger(listingId, 'listingId', { min: 1 });
    assertUserExists(cleanUserId);
    if (!getListingById(cleanListingId)) throw new ValidationError('Объявление не найдено.', 404);
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, listing_id) VALUES (?, ?)').run(cleanUserId, cleanListingId);
    return { ok: true };
  }

  export function removeFavorite(userId, listingId) {
    const cleanUserId = cleanInteger(userId, 'userId', { min: 1 });
    const cleanListingId = cleanInteger(listingId, 'listingId', { min: 1 });
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?').run(cleanUserId, cleanListingId);
    return { ok: true };
  }

  export function getFavorites(userId) {
    const cleanUserId = cleanInteger(userId, 'userId', { min: 1 });
    assertUserExists(cleanUserId);
    const rows = db.prepare(`${listingSelectSql()} JOIN favorites f ON f.listing_id = l.id WHERE f.user_id = ? ORDER BY
  f.created_at DESC`).all(cleanUserId);
    return rows.map(mapListing);
  }

  // ── Stats ──

  export function getStats() {
    const listings = db.prepare("SELECT COUNT(*) AS count FROM listings WHERE status='active'").get().count;
    const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    const categories = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
    return { activeListings: listings, totalUsers: users, totalCategories: categories };
  }

  export function closeDatabase() {
    db.close();
  }
