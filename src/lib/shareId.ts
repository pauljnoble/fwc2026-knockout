const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{10}$/;

export function isShareId(id: string): boolean {
  return SHARE_ID_PATTERN.test(id);
}
