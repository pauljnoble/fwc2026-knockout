import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobNotFoundError, head } from '@vercel/blob';

const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{10}$/;

function isShareId(id: string): boolean {
  return SHARE_ID_PATTERN.test(id);
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const id = typeof request.query.id === 'string' ? request.query.id : null;
  if (!id || !isShareId(id)) {
    return response.status(400).json({ error: 'Invalid share id' });
  }

  try {
    const blob = await head(`${id}.json`);
    const blobResponse = await fetch(blob.url);

    if (!blobResponse.ok) {
      throw new Error(`Failed to load shared draw (${blobResponse.status})`);
    }

    const json = await blobResponse.text();
    return response
      .status(200)
      .setHeader('Content-Type', 'application/json')
      .send(json);
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return response.status(404).json({ error: 'Shared draw not found' });
    }

    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load shared draw',
    });
  }
}
