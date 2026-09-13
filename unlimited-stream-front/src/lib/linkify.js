const URL_RE = /https?:\/\/[^\s]+/g;
const TRAILING_PUNCT_RE = /[.,!?;:)\]}»”'"]+$/;

// Splits text into plain strings and { url } pieces so callers can render links
// as real <a> elements via React (never dangerouslySetInnerHTML — plain text
// pieces stay plain text and are escaped normally, so this can't introduce XSS).
export function linkifyParts(text) {
  const parts = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const trimmed = raw.replace(TRAILING_PUNCT_RE, "");
    if (!trimmed) continue;

    const start = match.index;
    const end = start + trimmed.length;

    if (start > lastIndex) parts.push(text.slice(lastIndex, start));
    parts.push({ url: trimmed });
    lastIndex = end;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
