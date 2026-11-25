import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chunkPages } from '../server/pdf/chunk.js';
import { generateOutline } from '../server/outline/generate.js';
import { openDatabase } from '../server/db.js';
import { retrieveChunks } from '../server/retrieval/bm25.js';
import { KeyStore, maskApiKey } from '../server/security/key-store.js';

describe('PDF text chunking', () => {
  it('keeps page numbers and splits long page text', () => {
    const longText = Array.from({ length: 40 }, (_, index) => `Sentence ${index} about neural networks.`).join(' ');
    const chunks = chunkPages([
      { page: 1, lines: ['One'], text: 'A short paragraph about the perceptron.' },
      { page: 2, lines: ['Two'], text: longText },
    ]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].page).toBe(1);
    expect(chunks.every((chunk) => chunk.page >= 1)).toBe(true);
    expect(chunks.some((chunk) => chunk.page === 2)).toBe(true);
  });
});

describe('outline generation', () => {
  const numberedPages = [
    {
      page: 1,
      lines: ['1.1 Perceptron model', 'The perceptron computes a weighted sum of inputs. It is trained with an error-correcting rule.'],
      text: '1.1 Perceptron model\nThe perceptron computes a weighted sum of inputs. It is trained with an error-correcting rule.',
    },
    {
      page: 2,
      lines: ['1.2 Activation functions', 'Activation functions introduce non-linearity. Sigmoid and ReLU are common choices.'],
      text: '1.2 Activation functions\nActivation functions introduce non-linearity. Sigmoid and ReLU are common choices.',
    },
  ];

  it('builds heading-based topics with page-level sources', () => {
    const result = generateOutline(numberedPages, 'doc-1', 'lecture.pdf', 1);
    expect(result.method).toBe('headings');
    expect(result.topics).toHaveLength(2);
    expect(result.topics[0].title).toBe('Perceptron model');
    expect(result.topics[0].sourceRefs[0]).toMatchObject({
      documentId: 'doc-1',
      filename: 'lecture.pdf',
      page: 1,
    });
    expect(result.topics[1].sourceRefs[0].page).toBe(2);
  });

  it('falls back to page topics when no numbered headings exist', () => {
    const result = generateOutline(
      [
        {
          page: 1,
          lines: ['A paragraph without a numbered heading.'],
          text: 'A paragraph without a numbered heading. It explains a concept in plain prose for the reader.',
        },
      ],
      'doc-2',
      'notes.pdf',
      1,
    );
    expect(result.method).toBe('pages');
    expect(result.topics[0].title).toBe('Page 1');
    expect(result.topics[0].sourceRefs[0].page).toBe(1);
  });

  it('detects large slide titles and skips a sparse cover page', () => {
    const result = generateOutline(
      [
        {
          page: 1,
          lines: ['Intelligent Interaction', 'Week 1 · Lecture 01', 'University of Birmingham'],
          lineInfo: [
            { text: 'Intelligent Interaction', fontSize: 36, x: 40, y: 700 },
            { text: 'Week 1 · Lecture 01', fontSize: 16, x: 40, y: 660 },
            { text: 'University of Birmingham', fontSize: 16, x: 40, y: 640 },
          ],
          text: 'Intelligent Interaction\nWeek 1 · Lecture 01\nUniversity of Birmingham',
        },
        {
          page: 2,
          lines: ['What is feedback?', 'Feedback is information about the effect of an action.'],
          lineInfo: [
            { text: 'What is feedback?', fontSize: 32, x: 40, y: 700 },
            { text: 'Feedback is information about the effect of an action.', fontSize: 16, x: 40, y: 640 },
          ],
          text: 'What is feedback?\nFeedback is information about the effect of an action.',
        },
        {
          page: 3,
          lines: ['Why feedback fails', 'A signal must be noticed and interpreted.'],
          lineInfo: [
            { text: 'Why feedback fails', fontSize: 32, x: 40, y: 700 },
            { text: 'A signal must be noticed and interpreted.', fontSize: 16, x: 40, y: 640 },
          ],
          text: 'Why feedback fails\nA signal must be noticed and interpreted.',
        },
      ],
      'doc-3',
      'slides.pdf',
      1,
    );
    expect(result.method).toBe('headings');
    expect(result.topics).toHaveLength(2);
    expect(result.topics[0].title).toBe('What is feedback?');
    expect(result.topics[0].sourceRefs[0].page).toBe(2);
  });
});

describe('retrieval confidence', () => {
  it('scores a course-relevant query above an unrelated one', () => {
    const db = openDatabase(':memory:');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO courses (id,name,color,created_at,updated_at) VALUES (?,?,?,?,?)').run(
      'course-1',
      'Neural Networks',
      '#0d746b',
      now,
      now,
    );
    db.prepare(
      `INSERT INTO documents (id,course_id,filename,stored_path,mime_type,size_bytes,page_count,status,uploaded_at,updated_at)
       VALUES (?,?,?,?,?,?,?,'ready',?,?)`,
    ).run('doc-1', 'course-1', 'lecture-1.pdf', 'stored.pdf', 'application/pdf', 100, 1, now, now);
    db.prepare(
      `INSERT INTO lectures (id,course_id,document_id,sort_order,title,generation_method,auto_generated,created_at,updated_at)
       VALUES (?,?,?,?,?,'headings',1,?,?)`,
    ).run('lec-1', 'course-1', 'doc-1', 1, 'Lecture 1', now, now);
    db.prepare(
      `INSERT INTO chunks (id,course_id,document_id,lecture_id,page,chunk_index,text,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      'chunk-1',
      'course-1',
      'doc-1',
      'lec-1',
      1,
      0,
      'The perceptron computes a weighted sum and applies an activation function during training.',
      now,
    );
    db.prepare(
      `INSERT INTO chunks (id,course_id,document_id,lecture_id,page,chunk_index,text,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      'chunk-2',
      'course-1',
      'doc-1',
      'lec-1',
      2,
      1,
      'A diagram shows how inference reaches into the world around the user.',
      now,
    );
    const high = retrieveChunks(db, 'course-1', 'How is a perceptron trained?', 5);
    const low = retrieveChunks(db, 'course-1', 'Who won the 2018 FIFA World Cup?', 5);
    expect(high.confidence).toBeGreaterThan(0.45);
    expect(high.chunks[0].filename).toBe('lecture-1.pdf');
    expect(low.confidence).toBeLessThan(0.45);
    expect(low.matchedTerms).toContain('world');
    db.close();
  });
});

describe('API key protection', () => {
  it('encrypts, decrypts, and masks keys without retaining plaintext', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'courseatlas-key-'));
    const store = new KeyStore(undefined, dir);
    const plaintext = 'sk-private-value-1234';
    const encrypted = store.encrypt(plaintext);
    expect(encrypted.ciphertext).not.toContain(plaintext);
    expect(store.decrypt(encrypted)).toBe(plaintext);
    expect(maskApiKey(plaintext)).toBe('sk-****1234');
    expect(maskApiKey(plaintext)).not.toContain('private');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
