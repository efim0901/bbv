import { config } from './config.js';

export class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
  }
}

const restBaseUrl = `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1`;

function headers(extra = {}) {
  return {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${restBaseUrl}${path}`, {
    ...options,
    headers: headers(options.headers)
  });

  if (response.status === 204) return null;

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ValidationError(data?.message || data?.hint || 'Supabase request failed.', response.status);
  }

  return data;
}

function cleanText(value, field, { required = true, max = 2000 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`Поле "${field}" обязательно.`);
    return null;
  }

  const text = String(value).trim();
  if (!text && required) throw new ValidationError(`Поле "${field}" обязательно.`);
  if (text.length > max) throw new ValidationError(`Поле "${field}" слишком длинное.`);
  return text || null;
}

function cleanInteger(value, field, { required = true, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`Поле "${field}" обязательно.`);
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) throw new ValidationError(`Поле "${field}" должно быть числом.`);
  const rounded = Math.round(number);
  if (rounded < min || rounded > max) {
    throw new ValidationError(`Поле "${field}" вне допустимого диапазона.`);
  }
  return rounded;
}

function cleanStatus(status, fallback = 'active') {
  if (!status) return fallback;
  const allowed = new Set(['draft', 'active', 'sold', 'archived', 'deleted']);
  if (!allowed.has(status)) throw new ValidationError('Недопустимый статус объявления.');
  return status;
}

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    telegramId: row.telegram_id,
    rating: row.rating,
    createdAt: row.created_at
  };
}

function toCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parent_id,
    parentName: row.parentName,
    sortOrder: row.sort_order
  };
}

function toImage(row) {
  return {
    id: row.id,
    url: row.url,
    altText: row.alt_text,
    sortOrder: row.sort_order
  };
}

function toListing(row, lookups = {}) {
  if (!row) return null;
  const seller = row.seller || lookups.users?.get(row.seller_id);
  const category = row.category || lookups.categories?.get(row.category_id);
  const images = row.images || lookups.images?.get(row.id) || [];

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    price: row.price,
    currency: row.currency,
    status: row.status,
    city: row.city,
    views: row.views || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    seller: {
      id: seller?.id || row.seller_id,
      name: seller?.name || null,
      phone: seller?.phone || null,
      telegramId: seller?.telegram_id || null,
      rating: seller?.rating || 0
    },
    category: category
      ? {
          id: category.id,
          name: category.name,
          slug: category.slug,
          parentId: category.parent_id
        }
      : null,
    images: images.map(toImage)
  };
}

function idList(ids) {
  return `(${ids.map((id) => Number(id)).join(',')})`;
}

async function getRowsByIds(table, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(Number))];
  if (!uniqueIds.length) return [];
  return supabaseRequest(`/${table}?id=in.${idList(uniqueIds)}`);
}

async function hydrateListings(rows) {
  if (!rows.length) return [];

  const [users, categories, images] = await Promise.all([
    getRowsByIds('users', rows.map((row) => row.seller_id)),
    getRowsByIds('categories', rows.map((row) => row.category_id)),
    supabaseRequest(`/images?listing_id=in.${idList(rows.map((row) => row.id))}&order=sort_order.asc,id.asc`)
  ]);

  const imageMap = new Map();
  for (const image of images || []) {
    if (!imageMap.has(image.listing_id)) imageMap.set(image.listing_id, []);
    imageMap.get(image.listing_id).push(image);
  }

  const lookups = {
    users: new Map(users.map((user) => [user.id, user])),
    categories: new Map(categories.map((category) => [category.id, category])),
    images: imageMap
  };

  return rows.map((row) => toListing(row, lookups));
}

export async function createUser(input = {}) {
  const name = cleanText(input.name || input.username, 'name', { max: 120 });
  const phone = cleanText(input.phone, 'phone', { required: false, max: 40 });
  const telegramId = cleanText(input.telegramId || input.telegram_id, 'telegramId', {
    required: false,
    max: 80
  });

  if (telegramId) {
    const existing = await supabaseRequest(`/users?telegram_id=eq.${encodeURIComponent(telegramId)}&limit=1`);
    if (existing.length) {
      const body = { name };
      if (phone) body.phone = phone;
      const [updated] = await supabaseRequest(`/users?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      return toUser(updated);
    }
  }

  const [created] = await supabaseRequest('/users', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name,
      phone,
      telegram_id: telegramId
    })
  });

  return toUser(created);
}

export async function getCategories() {
  const rows = await supabaseRequest('/categories?order=sort_order.asc,name.asc');
  const parents = new Map(rows.map((row) => [row.id, row.name]));
  return rows
    .map((row) => toCategory({ ...row, parentName: parents.get(row.parent_id) || null }))
    .sort((a, b) => {
      const aRoot = a.parentId || a.id;
      const bRoot = b.parentId || b.id;
      if (aRoot !== bRoot) return aRoot - bRoot;
      if (Boolean(a.parentId) !== Boolean(b.parentId)) return a.parentId ? 1 : -1;
      return a.name.localeCompare(b.name, 'ru');
    });
}

async function assertCategoryExists(categoryId) {
  if (!categoryId) return;
  const rows = await supabaseRequest(`/categories?id=eq.${categoryId}&limit=1`);
  if (!rows.length) throw new ValidationError('Категория не найдена.', 404);
}

async function getUserById(id) {
  const rows = await supabaseRequest(`/users?id=eq.${id}&limit=1`);
  return toUser(rows[0]);
}

async function assertUserExists(userId) {
  const user = await getUserById(userId);
  if (!user) throw new ValidationError('Пользователь не найден.', 404);
  return user;
}

async function descendantsForCategory(categoryId) {
  const categories = await supabaseRequest('/categories');
  const ids = new Set([Number(categoryId)]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parent_id && ids.has(category.parent_id) && !ids.has(category.id)) {
        ids.add(category.id);
        changed = true;
      }
    }
  }

  return [...ids];
}

export async function getListingById(id) {
  const listingId = cleanInteger(id, 'id', { min: 1 });
  const rows = await supabaseRequest(`/listings?id=eq.${listingId}&status=neq.deleted&limit=1`);
  const listings = await hydrateListings(rows);
  if (listings[0]) {
    await supabaseRequest(`/listings?id=eq.${listingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ views: listings[0].views + 1 })
    });
    listings[0].views += 1;
  }
  return listings[0] || null;
}

async function listingParams(filters = {}, { includePagination = true } = {}) {
  const params = new URLSearchParams();

  if (filters.status && filters.status !== 'all') {
    params.set('status', `eq.${cleanStatus(filters.status)}`);
  } else if (!filters.status) {
    params.set('status', 'eq.active');
  } else {
    params.set('status', 'neq.deleted');
  }

  if (filters.categoryId) {
    const categoryId = cleanInteger(filters.categoryId, 'categoryId', { min: 1 });
    await assertCategoryExists(categoryId);
    const categoryIds = await descendantsForCategory(categoryId);
    params.set('category_id', `in.${idList(categoryIds)}`);
  }

  if (filters.q) {
    const query = cleanText(filters.q, 'q', { max: 120 }).replaceAll('*', '');
    params.set('or', `(title.ilike.*${query}*,description.ilike.*${query}*,city.ilike.*${query}*)`);
  }

  if (filters.minPrice) params.set('price', `gte.${cleanInteger(filters.minPrice, 'minPrice')}`);
  if (filters.maxPrice) params.append('price', `lte.${cleanInteger(filters.maxPrice, 'maxPrice')}`);
  if (filters.city) params.set('city', `ilike.*${cleanText(filters.city, 'city', { max: 120 })}*`);
  if (filters.sellerId) params.set('seller_id', `eq.${cleanInteger(filters.sellerId, 'sellerId', { min: 1 })}`);

  const sort = {
    newest: 'created_at.desc',
    price_asc: 'price.asc,created_at.desc',
    price_desc: 'price.desc,created_at.desc'
  }[filters.sort || 'newest'] || 'created_at.desc';

  params.set('order', sort);
  if (includePagination) {
    params.set('limit', String(cleanInteger(filters.limit || 24, 'limit', { min: 1, max: 100 })));
    params.set('offset', String(cleanInteger(filters.offset || 0, 'offset', { min: 0 })));
  }

  return params;
}

export async function getListings(filters = {}) {
  const limit = cleanInteger(filters.limit || 24, 'limit', { min: 1, max: 100 });
  const offset = cleanInteger(filters.offset || 0, 'offset', { min: 0 });
  const params = await listingParams({ ...filters, limit, offset });
  const countParams = await listingParams(filters, { includePagination: false });
  countParams.set('select', 'id');

  const [rows, countRows] = await Promise.all([
    supabaseRequest(`/listings?${params.toString()}`),
    supabaseRequest(`/listings?${countParams.toString()}`)
  ]);
  const items = await hydrateListings(rows);
  const total = countRows.length;
  return { items, total, limit, offset, hasMore: offset + limit < total };
}

async function resolveSeller(input) {
  if (input.sellerId) {
    const sellerId = cleanInteger(input.sellerId, 'sellerId', { min: 1 });
    return assertUserExists(sellerId);
  }

  if (input.user && typeof input.user === 'object') {
    return createUser(input.user);
  }

  if (input.sellerTelegramId) {
    return createUser({
      name: input.sellerName || 'Telegram user',
      phone: input.sellerPhone,
      telegramId: input.sellerTelegramId
    });
  }

  return createUser({
    name: input.sellerName || 'Продавец',
    phone: input.sellerPhone
  });
}

async function replaceImages(listingId, imageUrls = []) {
  await supabaseRequest(`/images?listing_id=eq.${listingId}`, { method: 'DELETE' });

  if (!Array.isArray(imageUrls)) return;

  const images = imageUrls
    .map((url) => cleanText(url, 'imageUrl', { required: false, max: 2000 }))
    .filter(Boolean)
    .slice(0, 10)
    .map((url, index) => ({
      listing_id: listingId,
      url,
      alt_text: null,
      sort_order: index
    }));

  if (!images.length) return;

  await supabaseRequest('/images', {
    method: 'POST',
    body: JSON.stringify(images)
  });
}

export async function createListing(input = {}) {
  const seller = await resolveSeller(input);
  const categoryId = cleanInteger(input.categoryId, 'categoryId', { required: false, min: 1 });
  await assertCategoryExists(categoryId);

  const [created] = await supabaseRequest('/listings', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      seller_id: seller.id,
      category_id: categoryId,
      title: cleanText(input.title, 'title', { max: 140 }),
      description: cleanText(input.description, 'description', { max: 4000 }),
      price: cleanInteger(input.price, 'price', { min: 0, max: 1000000000 }),
      currency: cleanText(input.currency || 'BYN', 'currency', { max: 8 }),
      status: cleanStatus(input.status || 'active'),
      city: cleanText(input.city, 'city', { required: false, max: 120 })
    })
  });

  await replaceImages(created.id, input.imageUrls || input.images || []);
  return getListingById(created.id);
}

export async function updateListing(id, input = {}) {
  const listingId = cleanInteger(id, 'id', { min: 1 });
  const existing = await getListingById(listingId);
  if (!existing) throw new ValidationError('Объявление не найдено.', 404);

  const body = {};
  if (input.categoryId !== undefined) {
    body.category_id = cleanInteger(input.categoryId, 'categoryId', { required: false, min: 1 });
    await assertCategoryExists(body.category_id);
  }
  if (input.title !== undefined) body.title = cleanText(input.title, 'title', { max: 140 });
  if (input.description !== undefined) {
    body.description = cleanText(input.description, 'description', { max: 4000 });
  }
  if (input.price !== undefined) body.price = cleanInteger(input.price, 'price', { min: 0, max: 1000000000 });
  if (input.currency !== undefined) body.currency = cleanText(input.currency, 'currency', { max: 8 });
  if (input.status !== undefined) body.status = cleanStatus(input.status);
  if (input.city !== undefined) body.city = cleanText(input.city, 'city', { required: false, max: 120 });

  if (Object.keys(body).length) {
    await supabaseRequest(`/listings?id=eq.${listingId}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  }

  if (input.imageUrls || input.images) {
    await replaceImages(listingId, input.imageUrls || input.images);
  }

  return getListingById(listingId);
}

export async function deleteListing(id) {
  const listingId = cleanInteger(id, 'id', { min: 1 });
  const existing = await getListingById(listingId);
  if (!existing) throw new ValidationError('Объявление не найдено.', 404);
  await supabaseRequest(`/listings?id=eq.${listingId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'deleted' })
  });
  return { ok: true };
}

export async function updateUser(id, input = {}) {
  const userId = cleanInteger(id, 'id', { min: 1 });
  const existing = await getUserById(userId);
  if (!existing) throw new ValidationError('Пользователь не найден.', 404);

  const body = {};
  if (input.name !== undefined) body.name = cleanText(input.name, 'name', { max: 120 });
  if (input.phone !== undefined) body.phone = cleanText(input.phone, 'phone', { required: false, max: 40 });
  if (!Object.keys(body).length) return existing;

  const [updated] = await supabaseRequest(`/users?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });

  return toUser(updated);
}

export async function getUserListings(userId, { limit = 24, offset = 0 } = {}) {
  const cleanUserId = cleanInteger(userId, 'userId', { min: 1 });
  await assertUserExists(cleanUserId);
  return getListings({ sellerId: cleanUserId, status: 'all', limit, offset });
}

export async function addFavorite(userId, listingId) {
  const cleanUserId = cleanInteger(userId, 'userId', { min: 1 });
  const cleanListingId = cleanInteger(listingId, 'listingId', { min: 1 });
  await assertUserExists(cleanUserId);
  if (!(await getListingById(cleanListingId))) throw new ValidationError('Объявление не найдено.', 404);

  await supabaseRequest('/favorites', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({
      user_id: cleanUserId,
      listing_id: cleanListingId
    })
  });

  return { ok: true };
}

export async function removeFavorite(userId, listingId) {
  const cleanUserId = cleanInteger(userId, 'userId', { min: 1 });
  const cleanListingId = cleanInteger(listingId, 'listingId', { min: 1 });
  await supabaseRequest(`/favorites?user_id=eq.${cleanUserId}&listing_id=eq.${cleanListingId}`, {
    method: 'DELETE'
  });
  return { ok: true };
}

export async function getFavorites(userId) {
  const cleanUserId = cleanInteger(userId, 'userId', { min: 1 });
  await assertUserExists(cleanUserId);

  const favorites = await supabaseRequest(`/favorites?user_id=eq.${cleanUserId}&order=created_at.desc`);
  const listingIds = favorites.map((favorite) => favorite.listing_id);
  if (!listingIds.length) return [];

  const rows = await supabaseRequest(`/listings?id=in.${idList(listingIds)}&status=neq.deleted`);
  return hydrateListings(rows);
}

export async function getStats() {
  const [listings, users, categories] = await Promise.all([
    supabaseRequest('/listings?status=eq.active&select=id'),
    supabaseRequest('/users?select=id'),
    supabaseRequest('/categories?select=id')
  ]);

  return {
    activeListings: listings.length,
    totalUsers: users.length,
    totalCategories: categories.length
  };
}

export function closeDatabase() {
  return undefined;
}
