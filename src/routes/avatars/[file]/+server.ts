import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { avatarPath } from '$lib/server/imageCache';

const FILE_RE = /^[a-f0-9]{64}\.(png|jpg|webp|gif|svg)$/;
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml'
};

export const GET: RequestHandler = async ({ params }) => {
  const file = params.file ?? '';
  const match = FILE_RE.exec(file);
  if (!match) throw error(404, 'Not found');
  const path = avatarPath(file);
  let size: number;
  try {
    const st = await stat(path);
    if (!st.isFile()) throw error(404, 'Not found');
    size = st.size;
  } catch {
    throw error(404, 'Not found');
  }
  const stream = createReadStream(path);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(chunk instanceof Buffer ? new Uint8Array(chunk) : chunk as Uint8Array));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    }
  });
  return new Response(body, {
    headers: {
      'Content-Type': MIME_BY_EXT[match[1]] ?? 'application/octet-stream',
      'Content-Length': String(size),
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
};
