  import test from 'node:test';
  import assert from 'node:assert/strict';

  process.env.MARKETPLACE_DB_PATH = ':memory:';

  const {
    addFavorite,
    createListing,
    createUser,
    deleteListing,
    getCategories,
    getFavorites,
    getListingById,
    getListings,
    getStats,
    getUserListings,
    removeFavorite,
    updateListing,
    closeDatabase
  } = await import('../src/db.js');

  test('marketplace database — full CRUD flow', () => {
    // Users
    const seller = createUser({ name: 'Алексей', phone: '+375291234567', telegramId: '1001' });
    const buyer = createUser({ name: 'Марина', telegramId: '1002' });
    assert.ok(seller.id);
    assert.ok(buyer.id);

    // Duplicate telegramId returns same user
    const sellerAgain = createUser({ name: 'Alex Updated', telegramId: '1001' });
    assert.equal(sellerAgain.id, seller.id);
    assert.equal(sellerAgain.name, 'Alex Updated');

    // Categories
    const categories = getCategories();
    assert.ok(categories.length > 0);
    const phoneCat = categories.find(c => c.slug === 'mobile-phones');
    assert.ok(phoneCat);
    const rootCat = categories.find(c => c.slug === 'electronics');
    assert.ok(rootCat);

    // Create listing
    const listing = createListing({
      sellerId: seller.id,
      categoryId: phoneCat.id,
      title: 'iPhone 13 128 GB',
      description: 'Аккуратный телефон, полный комплект.',
      price: 1450,
      city: 'Минск',
      imageUrls: ['https://example.com/iphone.jpg']
    });
    assert.equal(listing.seller.id, seller.id);
    assert.equal(listing.images.length, 1);
    assert.equal(listing.status, 'active');
    assert.ok(listing.views >= 0);

    // Read listing (increments views)
    const fetched = getListingById(listing.id);
    assert.ok(fetched.views >= 1);

    // Listings with filters
  const activeListings = getListings({ q: 'iphone', categoryId: phoneCat.id });
  assert.ok(activeListings.items.length >= 1);
  assert.ok(activeListings.items.some(item => item.title === 'iPhone 13 128 GB'));
    assert.ok(activeListings.total >= 1);

    // Recursive category search
    const electronicsListings = getListings({ categoryId: rootCat.id });
    assert.ok(electronicsListings.items.length >= 1);

    // Price filters
    const cheapListings = getListings({ maxPrice: 1000 });
    assert.ok(cheapListings.items.every(l => l.price <= 1000));

    // Update listing
    const updated = updateListing(listing.id, { status: 'sold', price: 1300 });
    assert.equal(updated.status, 'sold');
    assert.equal(updated.price, 1300);
    assert.equal(getListingById(listing.id).status, 'sold');

    // Soft delete
    const deleteResult = deleteListing(listing.id);
    assert.equal(deleteResult.ok, true);
    assert.equal(getListingById(listing.id), null);

    // Deleted listing doesn't appear in listings
    const afterDelete = getListings({});
    assert.ok(afterDelete.items.every(l => l.id !== listing.id));
  });

  test('marketplace database — favorites', () => {
    const seller = createUser({ name: 'Продавец', telegramId: '2001' });
    const buyer = createUser({ name: 'Покупатель', telegramId: '2002' });
    const categories = getCategories();
    const cat = categories.find(c => c.parentId);

    const listing = createListing({
      sellerId: seller.id,
      categoryId: cat.id,
      title: 'Test Item',
      description: 'Test description',
      price: 100
    });

    // Add favorite
    assert.deepEqual(addFavorite(buyer.id, listing.id), { ok: true });
    const favs = getFavorites(buyer.id);
    assert.equal(favs.length, 1);
    assert.equal(favs[0].id, listing.id);

    // Remove favorite
    assert.deepEqual(removeFavorite(buyer.id, listing.id), { ok: true });
    assert.equal(getFavorites(buyer.id).length, 0);
  });

  test('marketplace database — user listings', () => {
    const seller = createUser({ name: 'Мульти-продавец', telegramId: '3001' });
    const categories = getCategories();
    const cat = categories.find(c => c.parentId);

    // Create 3 listings
    for (let i = 1; i <= 3; i++) {
      createListing({
        sellerId: seller.id,
        categoryId: cat.id,
        title: `Item ${i}`,
        description: `Description ${i}`,
        price: i * 100
      });
    }

    const result = getUserListings(seller.id, { limit: 2, offset: 0 });
    assert.equal(result.items.length, 2);
    assert.equal(result.total, 3);
    assert.equal(result.hasMore, true);

    const page2 = getUserListings(seller.id, { limit: 2, offset: 2 });
    assert.equal(page2.items.length, 1);
    assert.equal(page2.hasMore, false);
  });

  test('marketplace database — stats', () => {
    const stats = getStats();
    assert.ok(typeof stats.activeListings === 'number');
    assert.ok(typeof stats.totalUsers === 'number');
    assert.ok(typeof stats.totalCategories === 'number');
    assert.ok(stats.totalCategories > 0);
  });

  test('marketplace database — pagination', () => {
    const result = getListings({ limit: 5, offset: 0 });
    assert.ok(result.items.length <= 5);
    assert.ok(typeof result.total === 'number');
    assert.ok(typeof result.hasMore === 'boolean');
    assert.equal(result.limit, 5);
    assert.equal(result.offset, 0);
  });

  test('marketplace database — sorting', () => {
    const categories = getCategories();
    const cat = categories.find(c => c.parentId);
    const seller = createUser({ name: 'Сортировщик', telegramId: '4001' });

    createListing({ sellerId: seller.id, categoryId: cat.id, title: 'Дешёвый', description: 'Тест', price: 100 });
    createListing({ sellerId: seller.id, categoryId: cat.id, title: 'Дорогой', description: 'Тест', price: 5000 });

    const asc = getListings({ sort: 'price_asc', limit: 10 });
    const ascPrices = asc.items.map(l => l.price);
    for (let i = 1; i < ascPrices.length; i++) {
      assert.ok(ascPrices[i] >= ascPrices[i - 1], 'price_asc sort failed');
    }

    const desc = getListings({ sort: 'price_desc', limit: 10 });
    const descPrices = desc.items.map(l => l.price);
    for (let i = 1; i < descPrices.length; i++) {
      assert.ok(descPrices[i] <= descPrices[i - 1], 'price_desc sort failed');
    }
  });

  test('marketplace database — validation errors', () => {
    // Missing required fields
    assert.throws(() => createUser({}), /обязательно/);
    assert.throws(() => createListing({ sellerId: 1 }), /обязательно/);

    // Invalid price
    assert.throws(() => createListing({ sellerId: 1, title: 'Test', description: 'Test', price: -1 }), /диапазон/);

    // Non-existent listing
  assert.equal(getListingById(99999), null);
  });

  // Cleanup
  test('cleanup', () => {
    closeDatabase();
  });
