export const getExtensionFromMimeType = (mimeType: string): string | null => {
  const mimeToExt: Record<string, string> = {
    // === Documents ===
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/rtf': 'rtf',
    'application/xml': 'xml',
    'application/json': 'json',

    // === Images ===
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/heic': 'heic',
    'image/tiff': 'tiff',

    // === Audio ===
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/x-aac': 'aac',
    'audio/webm': 'weba',

    // === Video ===
    'video/mp4': 'mp4',
    'video/x-msvideo': 'avi',
    'video/mpeg': 'mpeg',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',

    // === Archives ===
    'application/zip': 'zip',
    'application/x-rar-compressed': 'rar',
    'application/x-7z-compressed': '7z',
    'application/gzip': 'gz',
    'application/x-tar': 'tar',

    // === Code & Others ===
    'text/html': 'html',
    'text/css': 'css',
    'application/javascript': 'js',
    'application/octet-stream': 'bin',
    'application/x-shockwave-flash': 'swf',
  };

  return mimeToExt[mimeType] || null;
};
