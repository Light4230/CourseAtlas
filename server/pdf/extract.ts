import fs from 'node:fs';
import { ApiError } from '../lib/errors.js';

export interface ExtractedLine {
  text: string;
  fontSize: number;
  x: number;
  y: number;
}

export interface ExtractedPage {
  page: number;
  text: string;
  lines: string[];
  lineInfo?: ExtractedLine[];
}

export interface ExtractionResult {
  pageCount: number;
  pages: ExtractedPage[];
  emptyPages: number[];
  totalCharacters: number;
}

interface TextFragment {
  str: string;
  transform?: number[];
  height?: number;
  hasEOL?: boolean;
}

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.js');
type PdfDocument = Awaited<ReturnType<PdfJsModule['getDocument']>['promise']>;

let pdfJsPromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    // PDF.js probes for browser canvas globals at module evaluation. Text
    // extraction does not render, so tiny placeholders avoid noisy warnings.
    const runtime = globalThis as Record<string, unknown>;
    runtime.DOMMatrix ??= class DOMMatrixPlaceholder {};
    runtime.Path2D ??= class Path2DPlaceholder {};
    pdfJsPromise = import('pdfjs-dist/legacy/build/pdf.js');
  }
  return pdfJsPromise;
}

export async function extractPdf(filePath: string): Promise<ExtractionResult> {
  if (!fs.existsSync(filePath)) {
    throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'The stored PDF could not be found.');
  }

  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(fs.readFileSync(filePath));
  let document: PdfDocument;
  try {
    document = await pdfjs.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      verbosity: 0,
    }).promise;
  } catch {
    throw new ApiError(422, 'PARSE_FAILED', 'The PDF could not be parsed.');
  }

  try {
    if (document.numPages > 300) {
      throw new ApiError(422, 'PARSE_FAILED', 'The PDF has more than 300 pages.');
    }
    const pages: ExtractedPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lineInfo = rebuildLines(content.items as unknown as TextFragment[]);
      pages.push({
        page: pageNumber,
        text: '',
        lines: lineInfo.map((line) => line.text),
        lineInfo,
      });
    }

    const repeated = findRepeatedFurniture(pages.map((page) => page.lines));
    const cleaned: ExtractedPage[] = pages.map((page) => {
      const lineInfo = (page.lineInfo ?? [])
        .map((line) => ({ ...line, text: cleanLine(line.text) }))
        .filter((line) => line.text.length > 0)
        .filter((line) => !repeated.has(furnitureKey(line.text)))
        .filter((line) => !isPageNumberLine(line.text));
      return {
        page: page.page,
        lines: lineInfo.map((line) => line.text),
        lineInfo,
        text: lineInfo.map((line) => line.text).join('\n').trim(),
      };
    });

    const emptyPages = cleaned.filter((page) => page.text.length < 20).map((page) => page.page);
    const totalCharacters = cleaned.reduce((sum, page) => sum + page.text.length, 0);
    if (totalCharacters < 40 || emptyPages.length === document.numPages) {
      throw new ApiError(
        422,
        'NO_TEXT_LAYER',
        'No text layer was found. This PDF may be a scan or image export; OCR is not implemented.',
      );
    }

    return {
      pageCount: document.numPages,
      pages: cleaned,
      emptyPages,
      totalCharacters,
    };
  } finally {
    await document.destroy().catch(() => undefined);
  }
}

function rebuildLines(items: TextFragment[]): ExtractedLine[] {
  const lines: ExtractedLine[] = [];
  let current = '';
  let currentSize = 0;
  let currentX = 0;
  let currentY = 0;
  let lastY: number | null = null;

  const commit = () => {
    const line = current.replace(/\s+/g, ' ').trim();
    if (line) {
      lines.push({
        text: line,
        fontSize: Number(currentSize.toFixed(2)),
        x: Number(currentX.toFixed(1)),
        y: Number(currentY.toFixed(1)),
      });
    }
    current = '';
    currentSize = 0;
    currentX = 0;
    currentY = 0;
  };

  for (const item of items) {
    const value = typeof item.str === 'string' ? item.str : '';
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const y = transform[5];
    const x = transform[4];
    const height = typeof item.height === 'number' ? item.height : 0;
    if (y !== undefined && lastY !== null && Math.abs(y - lastY) > 2.5 && current.trim()) {
      commit();
    }
    if (value) {
      current += `${value} `;
      currentSize = Math.max(currentSize, height);
      if (currentX === 0 && x !== undefined) currentX = x;
      currentY = y ?? currentY;
    }
    if (item.hasEOL) {
      commit();
      lastY = null;
    } else if (y !== undefined) {
      lastY = y;
    }
  }
  commit();
  return lines;
}

function cleanLine(line: string): string {
  return line
    .replace(/\u00a0/g, ' ')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([A-Za-z])-\s+([a-z])/g, '$1$2')
    .trim();
}

function furnitureKey(line: string): string {
  return line.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

function findRepeatedFurniture(pageLines: string[][]): Set<string> {
  if (pageLines.length < 2) {
    return new Set();
  }
  const counts = new Map<string, number>();
  for (const lines of pageLines) {
    const candidates = [...lines.slice(0, 2), ...lines.slice(-2)];
    const seen = new Set<string>();
    for (const line of candidates) {
      if (line.length > 120) continue;
      const key = furnitureKey(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(2, Math.ceil(pageLines.length * 0.5));
  return new Set(
    [...counts.entries()].filter(([, count]) => count >= threshold).map(([key]) => key),
  );
}

function isPageNumberLine(line: string): boolean {
  const normalized = line.toLowerCase().trim();
  return (
    /^(page\s*)?\d+(\s*(of|\/)\s*\d+)?$/.test(normalized) ||
    /^page\s+\d+$/.test(normalized) ||
    /^slide\s+\d+$/.test(normalized) ||
    /^\d+\s*\/\s*\d+$/.test(normalized)
  );
}
