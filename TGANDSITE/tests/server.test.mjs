import test from 'node:test';
  import assert from 'node:assert/strict';

process.env.MARKETPLACE_DB_PATH = ':memory:';
process.env.DATABASE_PROVIDER = 'sqlite';

  const { createMarketplaceServer } = await import('../src/server.js');

  async function request(server, path, options = {}) {
    const addr = server.address();
    const url = `http://127.0.0.1:${addr.port}${path}`;
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body
    });
    const text = await res.text();
    return {
      status: res.status,
      body: text,
      json: () => JSON.parse(text)
    };
  }

  test('server — health, categories, uploads, static', async () => {
    const server = createMarketplaceServer();
    await new Promise(resolve => server.listen(0, resolve));

    try {
      const health = await request(server, '/api/health').then(r => r.json());
      assert.equal(health.ok, true);
      assert.ok(health.timestamp);

      const stats = await request(server, '/api/stats').then(r => r.json());
      assert.ok(stats.stats.totalCategories > 0);

      const cats = await request(server, '/api/categories').then(r => r.json());
      assert.ok(cats.categories.length > 0);

      const upload = await request(server, '/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'photo.png', mimeType: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
        })
      }).then(r => r.json());
      assert.ok(upload.file.url);

      const html = await request(server, '/').then(r => r.body);
      assert.match(html, /Market Hub/);

      assert.equal((await request(server, '/api/unknown')).status, 404);
      assert.equal((await request(server, '/api/listings', { method: 'OPTIONS' })).status, 204);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('server — full listing CRUD via API', async () => {
    const server = createMarketplaceServer();
    await new Promise(resolve => server.listen(0, resolve));

    try {
      const user = await (await request(server, '/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'API Tester', telegramId: 'api_test_1' })
      })).json();
      assert.ok(user.user.id);

      const cats = await (await request(server, '/api/categories')).json();
      const cat = cats.categories.find(c => c.parentId);

      const created = await (await request(server, '/api/listings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: user.user.id, categoryId: cat.id, title: 'API Test', description: 'Test',
  price: 999, city: 'Test' })
      })).json();
      assert.equal(created.listing.title, 'API Test');

      const fetched = await (await request(server, `/api/listings/${created.listing.id}`)).json();
      assert.equal(fetched.listing.id, created.listing.id);

      const updated = await (await request(server, `/api/listings/${created.listing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: 777, status: 'sold' })
      })).json();
      assert.equal(updated.listing.price, 777);

      const list = await (await request(server, '/api/listings?limit=5&offset=0')).json();
      assert.ok(Array.isArray(list.items));

      const deleted = await (await request(server, `/api/listings/${created.listing.id}`, { method: 'DELETE' })).json();
      assert.equal(deleted.ok, true);

      assert.equal((await request(server, `/api/listings/${created.listing.id}`)).status, 404);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('server — validation errors return 400', async () => {
    const server = createMarketplaceServer();
    await new Promise(resolve => server.listen(0, resolve));

    try {
      assert.equal((await request(server, '/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
      })).status, 400);

      assert.equal((await request(server, '/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json'
      })).status, 400);

      const cats = await (await request(server, '/api/categories')).json();
      const cat = cats.categories.find(c => c.parentId);
      const user = await (await request(server, '/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'V', telegramId: 'v1' })
      })).json();

      assert.equal((await request(server, '/api/listings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: user.user.id, categoryId: cat.id, title: 'T', description: 'T', price: -100 })
      })).status, 400);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
