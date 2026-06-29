import { upload } from "@vercel/blob/client";
import { nanoid } from "nanoid";

export async function uploadDrawState(json: string): Promise<string> {
  const id = nanoid(10);

  await upload(`${id}.json`, json, {
    access: "public",
    handleUploadUrl: "/api/upload",
    contentType: "application/json",
  });

  return id;
}
