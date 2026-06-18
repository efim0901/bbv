
  import { mkdir, writeFile } from 'node:fs/promises';
  import { join, extname } from 'node:path';
  import { randomUUID } from 'node:crypto';
  import { config } from './config.js';
  import { ValidationError } from './repository.js';

  const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
  const EXTENSIONS_BY_MIME = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
  };

  // Magic bytes for file type validation
  const MAGIC_BYTES = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]] // RIFF header, further check needed
  };

  function extensionForUpload(fileName = '', mimeType = '') {
    const byName = extname(fileName).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(byName)) return byName;
    const byMime = EXTENSIONS_BY_MIME[mimeType.toLowerCase()];
    if (!byMime) throw new ValidationError('Поддерживаются только JPG, PNG, WEBP и GIF изображения.');
    return byMime;
  }

  function assertImageBuffer(buffer) {
    if (!buffer.length) throw new ValidationError('Файл пустой.');
    if (buffer.length > 6 * 1024 * 1024) throw new ValidationError('Фото должно быть не больше 6 MB.');
  }

  function validateMagicBytes(buffer, mimeType) {
    const signatures = MAGIC_BYTES[mimeType];
    if (!signatures) return; // Unknown type, skip validation
    for (const sig of signatures) {
      let match = true;
      for (let i = 0; i < sig.length; i++) {
        if (buffer[i] !== sig[i]) { match = false; break; }
      }
      if (match) return; // Valid
    }
    throw new ValidationError('Содержимое файла не совпадает с заявленным форматом.');
  }

  function resizeImage(buffer, mimeType) {
    // Node.js 24+ doesn't have built-in image processing
    // For production, use sharp or similar. For now, pass through.
    // TODO: integrate sharp for WebP conversion and resizing
    return { buffer, mimeType };
  }

  function supabaseStorageEnabled() {
    return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey && config.supabaseStorageBucket);
  }

  async function saveLocalImage(buffer, extension) {
    await mkdir(config.uploadDir, { recursive: true });
    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    await writeFile(join(config.uploadDir, fileName), buffer);
    return `/uploads/${fileName}`;
  }

  async function saveSupabaseImage(buffer, extension, mimeType) {
    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    const objectPath = `listings/${fileName}`;
    const baseUrl = config.supabaseUrl.replace(/\/+$/, '');
    const uploadUrl = `${baseUrl}/storage/v1/object/${config.supabaseStorageBucket}/${objectPath}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        apikey: config.supabaseServiceRoleKey,
        Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
        'Content-Type': mimeType || 'application/octet-stream',
        'x-upsert': 'false'
      },
      body: buffer
    });

    if (!response.ok) {
      const error = await response.text();
      throw new ValidationError(`Supabase Storage не принял файл: ${error}`, response.status);
    }

    return `${baseUrl}/storage/v1/object/public/${config.supabaseStorageBucket}/${objectPath}`;
  }

  export async function saveImageBuffer({ buffer, fileName, mimeType }) {
    const extension = extensionForUpload(fileName, mimeType);
    assertImageBuffer(buffer);

    // Validate magic bytes
    validateMagicBytes(buffer, mimeType);

    // Resize if needed (passthrough for now — add sharp later)
    const { buffer: processedBuffer } = resizeImage(buffer, mimeType);

    if (supabaseStorageEnabled()) {
      return saveSupabaseImage(processedBuffer, extension, mimeType);
    }

    return saveLocalImage(processedBuffer, extension);
  }

  export async function saveImageUpload(input = {}) {
    let buffer;
    try {
      buffer = Buffer.from(String(input.data || ''), 'base64');
    } catch {
      throw new ValidationError('Не удалось прочитать файл.');
    }

    const url = await saveImageBuffer({
      buffer,
      fileName: input.fileName || 'photo',
      mimeType: input.mimeType || ''
    });

    return {
      url,
      size: buffer.length,
      mimeType: input.mimeType || ''
    };
  }