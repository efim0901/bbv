 import { createServer } from 'node:http';
  import { readFile } from 'node:fs/promises';
  import { existsSync, statSync } from 'node:fs';
  import { extname, join, resolve } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import {
    ValidationError,
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
    updateUser
  } from './repository.js';
  import { config } from './config.js';
  import { saveImageUpload } from './storage.js';
  import { parseListingFilters, parsePagination } from './validate.js';
  import { handleTelegramUpdate } from './bot.js';

  // ── MIME types ──
  const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
  };

  // ── Rate limiter (simple in-memory) ──
  const rateLimitMap = new Map();
  const RATE_LIMIT_WINDOW = 60_000; // 1 min
  const RATE_LIMIT_MAX = 120; // requests per window

  function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
      rateLimitMap.set(ip, { start: now, count: 1 });
      return true;
    }
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) return false;
    return true;
  }

  // ── Response helpers ──
  function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(body);
  }

  function sendNoContent(res) {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods':
  'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
  }

  // ── Body parser ──
  async function readJson(req) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 10 * 1024 * 1024) throw new ValidationError('JSON body is too large.', 413);
    }
    if (!raw.trim()) return {};
    try { return JSON.parse(raw); } catch { throw new ValidationError('Invalid JSON body.'); }
  }

  // ── Router ──
  const routes = [];

  function route(method, pattern, handler) {
    const paramNames = [];
    const regex = new RegExp('^' + pattern.replace(/:([a-zA-Z_]+)/g, (_, name) => {
      paramNames.push(name);
      return '(\\d+)';
    }) + '$');
    routes.push({ method, pattern, regex, paramNames, handler });
  }

  function matchRoute(method, pathname) {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = pathname.match(r.regex);
      if (!m) continue;
      const params = {};
      r.paramNames.forEach((name, i) => { params[name] = m[i + 1]; });
      return { handler: r.handler, params };
    }
    return null;
  }

  // ── Define routes ──

  // Health
  route('GET', '/api/health', async () => {
    return {
      ok: true, service: 'tg-site-marketplace',
      database: config.supabaseUrl && config.supabaseServiceRoleKey ? 'supabase' : 'sqlite',
      storage: config.supabaseUrl && config.supabaseServiceRoleKey ? 'supabase-storage' : 'local',
      timestamp: new Date().toISOString()
    };
  });

  // Stats
  route('GET', '/api/stats', async () => {
    return { stats: await getStats() };
  });

  // Categories
  route('GET', '/api/categories', async () => {
    return { categories: await getCategories() };
  });

  // Users
  route('POST', '/api/users', async (req) => {
    const body = await readJson(req);
    return { user: await createUser(body) };
  });

  route('PATCH', '/api/users/:id', async (req, url, { id }) => {
    const body = await readJson(req);
    return { user: await updateUser(id, body) };
  });

  route('GET', '/api/users/:id/listings', async (req, url, { id }) => {
    const { limit, offset } = parsePagination(url.searchParams);
    return await getUserListings(id, { limit, offset });
  });

  // Listings
  route('GET', '/api/listings', async (req, url) => {
    const filters = parseListingFilters(url.searchParams);
    const { limit, offset } = parsePagination(url.searchParams);
    return await getListings({ ...filters, limit, offset });
  });

  route('POST', '/api/listings', async (req) => {
    const body = await readJson(req);
    return { listing: await createListing(body) };
  });

  route('GET', '/api/listings/:id', async (req, url, { id }) => {
    const listing = await getListingById(id);
    if (!listing) throw new ValidationError('Listing not found.', 404);
    return { listing };
  });

  route('PATCH', '/api/listings/:id', async (req, url, { id }) => {
    const body = await readJson(req);
    return { listing: await updateListing(id, body) };
  });

  route('DELETE', '/api/listings/:id', async (req, url, { id }) => {
    return await deleteListing(id);
  });

  // Uploads
  route('POST', '/api/uploads', async (req) => {
    const body = await readJson(req);
    return { file: await saveImageUpload(body) };
  });

  // Favorites
  route('POST', '/api/favorites', async (req) => {
    const body = await readJson(req);
    return await addFavorite(body.userId, body.listingId);
  });

  route('DELETE', '/api/favorites', async (req, url) => {
    return await removeFavorite(url.searchParams.get('userId'), url.searchParams.get('listingId'));
  });

  route('GET', '/api/users/:id/favorites', async (req, url, { id }) => {
    return { listings: await getFavorites(id) };
  });

  // ── Static files ──
  async function serveStatic(req, res, pathname) {
    const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const filePath = resolve(join(config.publicDir, requested));
    const publicRoot = resolve(config.publicDir);
    if (!filePath.startsWith(publicRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) return false;
    const body = await readFile(filePath);
    const contentType = mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': body.length });
    res.end(body);
    return true;
  }

  // ── Request handler ──
  async function requestHandler(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Logging
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - start}ms`);
    });

    try {
      // CORS preflight
      if (req.method === 'OPTIONS') { sendNoContent(res); return; }

      // Telegram webhook for production: one HTTPS service handles site, API and bot updates.
      if (url.pathname === '/telegram/webhook') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed.' });
          return;
        }

        const body = await readJson(req);
        await handleTelegramUpdate(body);
        sendJson(res, 200, { ok: true });
        return;
      }

      // Rate limiting for API
      if (url.pathname.startsWith('/api/')) {
        if (!checkRateLimit(ip)) {
          sendJson(res, 429, { error: 'Too many requests. Please slow down.' });
          return;
        }
      }

      // API routes
      if (url.pathname.startsWith('/api/')) {
        const matched = matchRoute(req.method, url.pathname);
        if (matched) {
          const result = await matched.handler(req, url, matched.params);
          const status = req.method === 'POST' ? 201 : 200;
          sendJson(res, status, result);
          return;
        }
        sendJson(res, 404, { error: 'API route not found.' });
        return;
      }

      // Static files
      const served = await serveStatic(req, res, url.pathname);
      if (!served) {
        const fallback = await serveStatic(req, res, '/');
        if (!fallback) sendJson(res, 404, { error: 'Not found.' });
      }
    } catch (error) {
      const status = error instanceof ValidationError ? error.status : 500;
      if (status >= 500) console.error(error);
      sendJson(res, status, { error: error.message || 'Internal server error.' });
    }
  }

  export function createMarketplaceServer() {
    return createServer(requestHandler);
  }

  export function startServer(port = config.port) {
    const server = createMarketplaceServer();
    server.listen(port, () => {
      const dbMode = config.databaseProvider === 'supabase' || (config.databaseProvider === 'auto' && config.supabaseUrl
  && config.supabaseServiceRoleKey) ? 'supabase' : 'sqlite';
      console.log(`🚀 Marketplace API and site: http://localhost:${port}`);
      console.log(`📦 Database: ${dbMode}`);
    });
    return server;
  }

  const currentFile = fileURLToPath(import.meta.url);
  if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
    startServer();
}
