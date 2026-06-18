
  import test from 'node:test';
  import assert from 'node:assert/strict';

  const {
    ValidationError,
    cleanText,
    cleanInteger,
    cleanStatus,
    cleanCurrency,
    parsePagination,
    parseListingFilters,
    paginatedResponse
  } = await import('../src/validate.js');

  test('cleanText — validates text fields', () => {
    assert.equal(cleanText('hello', 'field'), 'hello');
    assert.equal(cleanText('  hello  ', 'field'), 'hello');
    assert.equal(cleanText('', 'field', { required: false }), null);
    assert.equal(cleanText(null, 'field', { required: false }), null);
    assert.throws(() => cleanText('', 'field'), /обязательно/);
    assert.throws(() => cleanText(null, 'field'), /обязательно/);
    assert.throws(() => cleanText('a'.repeat(3000), 'field', { max: 2000 }), /длинное/);
  });

  test('cleanInteger — validates numbers', () => {
    assert.equal(cleanInteger(42, 'n'), 42);
    assert.equal(cleanInteger('42', 'n'), 42);
    assert.equal(cleanInteger(3.7, 'n'), 4);
    assert.equal(cleanInteger('', 'n', { required: false }), null);
    assert.throws(() => cleanInteger('abc', 'n'), /числом/);
    assert.throws(() => cleanInteger(-5, 'n', { min: 0 }), /диапазон/);
    assert.throws(() => cleanInteger(100, 'n', { max: 50 }), /диапазон/);
  });

  test('cleanStatus — validates status values', () => {
    assert.equal(cleanStatus('active'), 'active');
    assert.equal(cleanStatus('sold'), 'sold');
    assert.equal(cleanStatus('', 'active'), 'active');
    assert.equal(cleanStatus(null, 'draft'), 'draft');
    assert.throws(() => cleanStatus('invalid'), /Недопустимый/);
  });

  test('cleanCurrency — validates currency codes', () => {
    assert.equal(cleanCurrency('BYN'), 'BYN');
    assert.equal(cleanCurrency('usd'), 'USD');
    assert.equal(cleanCurrency(''), 'BYN');
    assert.throws(() => cleanCurrency('INVALID!'), /валюты/);
  });

  test('parsePagination — extracts limit/offset', () => {
    const params = new URLSearchParams('limit=10&offset=5');
    const result = parsePagination(params);
    assert.equal(result.limit, 10);
    assert.equal(result.offset, 5);

    // Defaults
    const defaults = parsePagination(new URLSearchParams());
    assert.equal(defaults.limit, 24);
    assert.equal(defaults.offset, 0);

    // Bounds
    assert.throws(() => parsePagination(new URLSearchParams('limit=200')), /диапазон/);
  });

  test('parseListingFilters — extracts filters from query', () => {
    const params = new URLSearchParams('q=iphone&categoryId=5&minPrice=100&maxPrice=500&sort=price_asc');
    const filters = parseListingFilters(params);
    assert.equal(filters.q, 'iphone');
    assert.equal(filters.categoryId, 5);
    assert.equal(filters.minPrice, 100);
    assert.equal(filters.maxPrice, 500);
    assert.equal(filters.sort, 'price_asc');
  });

  test('paginatedResponse — formats response', () => {
    const result = paginatedResponse([1, 2, 3], 10, 3, 0);
    assert.deepEqual(result, { items: [1, 2, 3], total: 10, limit: 3, offset: 0, hasMore: true });

    const last = paginatedResponse([1], 3, 3, 0);
    assert.equal(last.hasMore, false);
  });

  test('ValidationError — has correct properties', () => {
    const err = new ValidationError('Test error', 422);
    assert.equal(err.message, 'Test error');
    assert.equal(err.status, 422);
    assert.equal(err.name, 'ValidationError');
    assert.ok(err instanceof Error);
  });
