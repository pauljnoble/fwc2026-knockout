import type { VercelRequest, VercelResponse } from '@vercel/node';

const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{10}$/;

function isShareId(id: string): boolean {
  return SHARE_ID_PATTERN.test(id);
}

function getBlobStoreId(): string | null {
  if (process.env.BLOB_STORE_ID) {
    return process.env.BLOB_STORE_ID;
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return null;
  }

  return token.split('_')[3] ?? null;
}

function getPublicBlobUrl(pathname: string): string | null {
  const storeId = getBlobStoreId();
  if (!storeId) {
    return null;
  }

  return `https://${storeId}.public.blob.vercel-storage.com/${pathname}`;
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

  const url = getPublicBlobUrl(`${id}.json`);
  if (!url) {
    return response.status(500).json({ error: 'Blob storage is not configured' });
  }

  try {
    const blobResponse = await fetch(url);
    if (blobResponse.status === 404) {
      return response.status(404).json({ error: 'Shared draw not found' });
    }
    if (!blobResponse.ok) {
      throw new Error(`Failed to load shared draw (${blobResponse.status})`);
    }

    const json = await blobResponse.text();
    return response
      .status(200)
      .setHeader('Content-Type', 'application/json')
      .send(json);
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load shared draw',
    });
  }
}
