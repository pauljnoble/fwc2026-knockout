import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  handleUpload,
  type HandleUploadBody,
} from '@vercel/blob/client';

const MAX_JSON_SIZE = 100 * 1024; // 100 KB

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = (
      typeof request.body === 'string'
        ? JSON.parse(request.body)
        : request.body
    ) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,

      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.endsWith('.json')) {
          throw new Error('Only .json files are allowed');
        }

        return {
          allowedContentTypes: ['application/json'],
          maximumSizeInBytes: MAX_JSON_SIZE,

          // Prevent overwrites.
          allowOverwrite: false,

          addRandomSuffix: false,
        };
      },

      onUploadCompleted: async ({ blob }) => {
        console.log('JSON uploaded:', blob.url);
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    return response.status(400).json({
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
}