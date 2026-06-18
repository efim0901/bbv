
  -- Marketplace schema — SQLite
  -- Run once on first startup (applied automatically by db.exec in db.js)

  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    telegram_id TEXT UNIQUE,
    rating REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    slug TEXT,
    description TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 0),
    currency TEXT NOT NULL DEFAULT 'BYN',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'sold', 'archived', 'deleted')),
    city TEXT,
    views INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_listings_status_created ON listings(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category_id);
  CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
  CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_id);
  CREATE INDEX IF NOT EXISTS idx_listings_slug ON listings(slug);

  CREATE TRIGGER IF NOT EXISTS trg_listings_updated_at
  AFTER UPDATE ON listings
  FOR EACH ROW
  BEGIN
    UPDATE listings SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
  END;

  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt_text TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_images_listing ON images(listing_id, sort_order);

  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, listing_id)
  );

  -- Full-text search virtual table
  CREATE VIRTUAL TABLE IF NOT EXISTS listings_fts USING fts5(
    title,
    description,
    city,
    content='listings',
    content_rowid='id'
  );

  -- Triggers to keep FTS index in sync
  CREATE TRIGGER IF NOT EXISTS trg_listings_fts_insert
  AFTER INSERT ON listings
  BEGIN
    INSERT INTO listings_fts(rowid, title, description, city)
    VALUES (new.id, new.title, new.description, new.city);
  END;

  CREATE TRIGGER IF NOT EXISTS trg_listings_fts_delete
  AFTER DELETE ON listings
  BEGIN
    INSERT INTO listings_fts(listings_fts, rowid, title, description, city)
    VALUES('delete', old.id, old.title, old.description, old.city);
  END;

  CREATE TRIGGER IF NOT EXISTS trg_listings_fts_update
  AFTER UPDATE ON listings
  BEGIN
    INSERT INTO listings_fts(listings_fts, rowid, title, description, city)
    VALUES('delete', old.id, old.title, old.description, old.city);
    INSERT INTO listings_fts(rowid, title, description, city)
    VALUES (new.id, new.title, new.description, new.city);
  END;