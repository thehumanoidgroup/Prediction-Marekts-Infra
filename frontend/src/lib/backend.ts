/** Backend URL for server-side BFF proxy calls. */
export function getBackendUrl(): string | null {
  const url = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!url || url === "false" || url === "0") return null;
  return url.replace(/\/$/, "");
}

export function isBackendEnabled(): boolean {
  return getBackendUrl() !== null;
}
