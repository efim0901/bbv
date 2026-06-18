
  export class ValidationError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.name = 'ValidationError';
      this.status = status;
    }
  }

  export function cleanText(value, field, { required = true, max = 2000 } = {}) {
    if (value === undefined || value === null) {
      if (required) throw new ValidationError(`Поле "${field}" обязательно.`);
      return null;
    }
    const text = String(value).trim();
    if (!text && required) throw new ValidationError(`Поле "${field}" обязательно.`);
    if (text.length > max) throw new ValidationError(`Поле "${field}" слишком длинное (макс. ${max} символов).`);
    return text || null;
  }

  export function cleanInteger(value, field, { required = true, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) throw new ValidationError(`Поле "${field}" обязательно.`);
      return null;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) throw new ValidationError(`Поле "${field}" должно быть числом.`);
    const rounded = Math.round(number);
    if (rounded < min || rounded > max) {
      throw new ValidationError(`Поле "${field}" вне допустимого диапазона (${min}–${max}).`);
    }
    return rounded;
  }

  export function cleanStatus(status, fallback = 'active') {
    if (!status) return fallback;
    const allowed = new Set(['draft', 'active', 'sold', 'archived', 'deleted']);
    if (!allowed.has(status)) throw new ValidationError('Недопустимый статус объявления.');
    return status;
  }

  export function cleanCurrency(currency) {
    if (!currency) return 'BYN';
    const value = String(currency).trim().toUpperCase();
    if (!/^[A-Z]{2,8}$/.test(value)) throw new ValidationError('Недопустимый код валюты.');
    return value;
  }

  export function cleanSlug(value, field = 'slug') {
    if (!value) return null;
    const slug = String(value).trim().toLowerCase();
    if (!/^[a-zа-яё0-9_-]+$/i.test(slug)) {
      throw new ValidationError(`Поле "${field}" содержит недопустимые символы.`);
    }
    if (slug.length > 200) throw new ValidationError(`Поле "${field}" слишком длинное.`);
    return slug;
  }

  export function parsePagination(searchParams) {
    const limit = cleanInteger(searchParams.get('limit') || 24, 'limit', { min: 1, max: 100 });
    const offset = cleanInteger(searchParams.get('offset') || 0, 'offset', { min: 0 });
    return { limit, offset };
  }

  export function parseListingFilters(searchParams) {
    const filters = {};
    if (searchParams.has('status') && searchParams.get('status') !== 'all') {
      filters.status = cleanStatus(searchParams.get('status'));
    }
    if (searchParams.has('categoryId')) {
      filters.categoryId = cleanInteger(searchParams.get('categoryId'), 'categoryId', { min: 1 });
    }
    if (searchParams.has('q')) {
      filters.q = cleanText(searchParams.get('q'), 'q', { max: 120 });
    }
    if (searchParams.has('minPrice')) {
      filters.minPrice = cleanInteger(searchParams.get('minPrice'), 'minPrice');
    }
    if (searchParams.has('maxPrice')) {
      filters.maxPrice = cleanInteger(searchParams.get('maxPrice'), 'maxPrice');
    }
    if (searchParams.has('city')) {
      filters.city = cleanText(searchParams.get('city'), 'city', { required: false, max: 120 });
    }
    if (searchParams.has('sellerId')) {
      filters.sellerId = cleanInteger(searchParams.get('sellerId'), 'sellerId', { min: 1 });
    }
    if (searchParams.has('sort')) {
      filters.sort = searchParams.get('sort');
    }
    return filters;
  }

  export function paginatedResponse(items, total, limit, offset) {
    return { items, total, limit, offset, hasMore: offset + limit < total };
  }

