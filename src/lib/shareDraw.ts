import { upload } from "@vercel/blob/client";
import { nanoid } from "nanoid";
import { isShareId } from "./shareId";

export { isShareId } from "./shareId";

export function getShareIdFromUrl(): string | null {
  const id = new URLSearchParams(window.location.search).get("share");
  if (!id || !isShareId(id)) {
    return null;
  }

  return id;
}

export async function uploadDrawState(json: string): Promise<string> {
  const id = nanoid(10);

  await upload(`${id}.json`, json, {
    access: "public",
    handleUploadUrl: "/api/upload",
    contentType: "application/json",
  });

  return id;
}

export async function loadDrawState(id: string): Promise<string> {
  const response = await fetch(`/api/share?id=${encodeURIComponent(id)}`);

  if (!response.ok) {
    let message = "Failed to load shared draw.";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Ignore malformed error responses.
    }
    throw new Error(message);
  }

  return response.text();
}
