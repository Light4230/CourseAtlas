import type { ExtractedPage } from './extract.js';

export interface TextChunk {
  page: number;
  chunkIndex: number;
  text: string;
}

const MAX_CHUNK_CHARS = 900;
const MIN_CHUNK_CHARS = 20;

export function chunkPages(pages: ExtractedPage[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let globalIndex = 0;
  for (const page of pages) {
    for (const text of splitPageText(page.text)) {
      if (text.length < MIN_CHUNK_CHARS) continue;
      chunks.push({ page: page.page, chunkIndex: globalIndex, text });
      globalIndex += 1;
    }
  }
  return chunks;
}

export function splitPageText(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= MAX_CHUNK_CHARS) return [normalized];

  const units = normalized
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((unit) => unit.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    if (unit.length > MAX_CHUNK_CHARS) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let start = 0; start < unit.length; start += MAX_CHUNK_CHARS) {
        chunks.push(unit.slice(start, start + MAX_CHUNK_CHARS));
      }
      continue;
    }
    if (current && current.length + unit.length + 1 > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = unit;
    } else {
      current = current ? `${current} ${unit}` : unit;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((chunk) => chunk.length > 0);
}

export function makeExcerpt(text: string, maxLength = 280): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  const clipped = compact.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength).trim()}…`;
}
