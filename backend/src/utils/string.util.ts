export function toTitleCase(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
