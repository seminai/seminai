export function buildOpenRouterHeaders(
  referer: string | undefined,
  title: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (referer) headers['HTTP-Referer'] = referer;
  if (title) headers['X-Title'] = title;
  return headers;
}
