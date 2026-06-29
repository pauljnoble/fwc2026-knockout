import type { VercelRequest, VercelResponse } from '@vercel/node';
import { get } from '@vercel/blob';
import { isShareId } from '../src/lib/shareId';

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
    const result = await get(`${id}.json`, { access: 'public' });
    if (!result) {
      return response.status(404).json({ error: 'Shared draw not found' });
    }

    const json = await new Response(result.stream).text();
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
