/**
 * Helper function to extract sources from tool message content
 */
export function extractSourcesFromToolContent(content: string): Array<{
  url: string;
  title: string;
  description: string;
}> {
  const sources: Array<{ url: string; title: string; description: string }> = [];

  // Try to parse as JSON first (for label extraction results)
  try {
    const parsed = JSON.parse(content);
    if (parsed.source && parsed.source.url) {
      sources.push({
        url: parsed.source.url,
        title: parsed.source.title || 'Document',
        description: parsed.source.description || '',
      });
    }
    return sources;
  } catch {
    // Not JSON, try to extract from text format
  }

  // Extract from text format (Tavily results)
  const sourceRegex =
    /\[SOURCE_(\d+)\]\s*Title:\s*(.+?)\s*URL:\s*(.+?)\s*Content:\s*(.+?)\s*Fragment:\s*(.+?)(?=\n---|\n\[SOURCE_|$)/gs;
  let match;

  while ((match = sourceRegex.exec(content)) !== null) {
    const [, , title, url, , fragment] = match;
    if (title && url) {
      sources.push({
        url: url.trim(),
        title: title.trim(),
        description: fragment?.trim() || '',
      });
    }
  }

  return sources;
}
