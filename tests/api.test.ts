import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { createApp } from '../server/app.js';
import type { AppContext } from '../server/context.js';
import { openDatabase } from '../server/db.js';
import { KeyStore } from '../server/security/key-store.js';
import { DocumentQueue } from '../server/services/document-queue.js';
import type { AppConfig } from '../server/config.js';

const sampleOne = path.resolve('samples/neural-networks/Lecture 1 - Perceptron and Backpropagation.pdf');
const sampleTwo = path.resolve('samples/neural-networks/Lecture 2 - Convolutional Neural Networks.pdf');
const sampleScan = path.resolve('samples/scanned-image-only.pdf');

describe('CourseAtlas API', () => {
  let tempDir: string;
  let db: ReturnType<typeof openDatabase>;
  let app: ReturnType<typeof createApp>;
  let mockServer: http.Server;
  let mockPort: number;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'courseatlas-api-'));
    const config: AppConfig = {
      port: 0,
      uploadsDir: path.join(tempDir, 'uploads'),
      dataDir: path.join(tempDir, 'data'),
      databasePath: path.join(tempDir, 'data', 'test.db'),
      secretsDir: path.join(tempDir, 'secrets'),
      modelKeySecret: undefined,
      tavilyApiKey: undefined,
      allowLocalModels: true,
      maxUploadMb: 20,
      clientDir: path.join(tempDir, 'client'),
    };
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    db = openDatabase(config.databasePath);
    const keyStore = new KeyStore(config.modelKeySecret, config.secretsDir);
    const queue = new DocumentQueue(db, config.uploadsDir, keyStore);
    const ctx: AppContext = { db, config, keyStore, queue };
    app = createApp(ctx);

    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        const system = String(parsed.messages?.find((message: { role: string }) => message.role === 'system')?.content ?? '');
        const user = String(parsed.messages?.find((message: { role: string }) => message.role === 'user')?.content ?? '');
        let content = 'Mock answer.';
        if (system.includes('retrieval planner')) {
          const question = user.match(/Question:\s*([\s\S]*?)\n\n/)?.[1] ?? '';
          const noToolResults = /Tool results already collected:\s*None yet\./.test(user);
          content = !noToolResults || !/perceptron/i.test(question)
            ? JSON.stringify({ done: true })
            : JSON.stringify({
                tool: 'search_chunks',
                arguments: { query: 'perceptron training', topK: 3 },
              });
        } else if (system.includes('three-level outline')) {
          const pages = [...user.matchAll(/\[\[PAGE (\d+)\]\]/g)].map((match) =>
            Number(match[1]),
          );
          const page = (index: number) =>
            pages[Math.min(index, Math.max(0, pages.length - 1))] ?? 1;
          content = JSON.stringify({
            chapters: [0, 1, 2].map((chapterIndex) => ({
              title: `Mock chapter ${chapterIndex + 1}`,
              summaryEn: 'Mock English chapter overview.',
              summaryZh: '模拟中文章节概述。',
              sourcePages: [page(chapterIndex)],
              sections: [0].map((sectionIndex) => ({
                title: `Mock section ${chapterIndex + 1}.${sectionIndex + 1}`,
                summaryEn: 'Mock English section overview.',
                summaryZh: '模拟中文小节概述。',
                sourcePages: [page(chapterIndex)],
                points: [0, 1].map((pointIndex) => ({
                  title: `Mock point ${chapterIndex + 1}.${sectionIndex + 1}.${pointIndex + 1}`,
                  summaryEn: 'Mock English point summary.',
                  summaryZh: '模拟中文知识点摘要。',
                  keywords: ['mock', 'outline'],
                  sourcePages: [page(chapterIndex + pointIndex)],
                })),
              })),
            })),
          });
        } else if (system.includes('supplied course excerpts') || system.includes('course tools')) {
          const label = user.match(/\[1\]\s+([^\n]+?)\s+\(/)?.[1] ?? 'lecture.pdf p.1';
          content = `A perceptron is trained with error-correcting updates. Source: [${label}].`;
        } else if (system.includes('course knowledge base did not contain')) {
          content = 'General knowledge only: France won the 2018 FIFA World Cup.';
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content } }],
          }),
        );
      });
    });
    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    mockPort = (mockServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    try {
      db.close();
    } catch {
      // Already closed by the persistence assertion.
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('supports the complete PDF, outline, model, chat, and deletion flow', async () => {
    const courseResponse = await request(app)
      .post('/api/courses')
      .send({ name: 'API Test Course', color: '#0d746b' })
      .expect(201);
    const courseId = courseResponse.body.course.id as string;

    const upload = await request(app)
      .post(`/api/courses/${courseId}/documents`)
      .attach('files', sampleOne)
      .attach('files', sampleTwo)
      .expect(202);
    expect(upload.body.documents).toHaveLength(2);

    const readyDocs = await waitFor(async () => {
      const response = await request(app).get(`/api/courses/${courseId}/documents`).expect(200);
      return response.body.documents.every((document: { status: string }) =>
        ['ready', 'failed'].includes(document.status),
      )
        ? response.body.documents
        : null;
    });
    expect(readyDocs).toHaveLength(2);
    expect(readyDocs.every((document: { status: string }) => document.status === 'ready')).toBe(true);

    const outlineResponse = await request(app)
      .get(`/api/courses/${courseId}/outline`)
      .expect(200);
    expect(outlineResponse.body.lectures).toHaveLength(2);
    expect(outlineResponse.body.lectures.flatMap((lecture: { topics: unknown[] }) => lecture.topics)).toHaveLength(6);
    const firstDocumentId = outlineResponse.body.lectures[0].documentId as string;
    const firstTopic = outlineResponse.body.lectures[0].topics[0];

    const pageResponse = await request(app)
      .get(`/api/documents/${firstDocumentId}/pages/1`)
      .expect(200);
    expect(pageResponse.body.text.toLowerCase()).toContain('perceptron');
    expect(pageResponse.body.page).toBe(1);

    const pdfResponse = await request(app)
      .get(`/api/documents/${firstDocumentId}/file`)
      .expect(200);
    expect(pdfResponse.headers['content-type']).toContain('application/pdf');
    expect(Number(pdfResponse.headers['content-length'])).toBeGreaterThan(1000);

    const reject = await request(app)
      .post(`/api/courses/${courseId}/documents`)
      .attach('files', Buffer.from('this is not a pdf'), {
        filename: 'slides.pptx',
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      })
      .expect(400);
    expect(reject.body.error.code).toBe('NOT_PDF');

    const scanUpload = await request(app)
      .post(`/api/courses/${courseId}/documents`)
      .attach('files', sampleScan)
      .expect(202);
    const scanId = scanUpload.body.documents[0].id as string;
    const failedScan = await waitFor(async () => {
      const response = await request(app).get(`/api/courses/${courseId}/documents`).expect(200);
      return response.body.documents.find((document: { id: string }) => document.id === scanId)?.status === 'failed'
        ? response.body.documents.find((document: { id: string }) => document.id === scanId)
        : null;
    });
    expect(failedScan.errorCode).toBe('NO_TEXT_LAYER');

    const testApiKey = `sk-test-${crypto.randomUUID().replace(/-/g, '')}`;
    const modelResponse = await request(app)
      .post('/api/models')
      .send({
        displayName: 'Mock Tutor',
        provider: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${mockPort}/v1`,
        modelId: 'mock-tutor',
        apiKey: testApiKey,
      })
      .expect(201);
    const modelId = modelResponse.body.model.id as string;
    expect(modelResponse.body.model.maskedKey).toBe(`sk-****${testApiKey.slice(-4)}`);
    const modelsResponse = await request(app).get('/api/models').expect(200);
    const serialised = JSON.stringify(modelsResponse.body);
    expect(serialised).not.toContain(testApiKey);
    expect(serialised).not.toContain('apiKeyEncrypted');
    expect(serialised).not.toContain('"iv"');
    expect(serialised).not.toContain('authTag');

    const aiUpload = await request(app)
      .post(`/api/courses/${courseId}/documents`)
      .field('outlineModelId', modelId)
      .attach('files', sampleOne)
      .expect(202);
    const aiDocumentId = aiUpload.body.documents[0].id as string;
    const aiReady = await waitFor(async () => {
      const response = await request(app).get(`/api/courses/${courseId}/documents`).expect(200);
      return response.body.documents.find(
        (document: { id: string }) => document.id === aiDocumentId,
      )?.status === 'ready'
        ? true
        : null;
    });
    expect(aiReady).toBe(true);
    const aiOutlineResponse = await request(app)
      .get(`/api/courses/${courseId}/outline`)
      .expect(200);
    const aiLecture = aiOutlineResponse.body.lectures.find(
      (lecture: { documentId: string }) => lecture.documentId === aiDocumentId,
    );
    expect(aiLecture.generationMethod).toBe('ai');
    expect(aiLecture.outlineModelName).toBe('Mock Tutor');
    expect(aiLecture.topics.some((topic: { kind: string }) => topic.kind === 'chapter')).toBe(true);
    expect(aiLecture.topics.some((topic: { kind: string }) => topic.kind === 'section')).toBe(true);
    expect(aiLecture.topics.some((topic: { kind: string }) => topic.kind === 'point')).toBe(true);
    expect(
      aiLecture.topics.find((topic: { kind: string }) => topic.kind === 'chapter').summaryZh,
    ).toBeTruthy();

    const highChat = await request(app)
      .post('/api/chat')
      .send({
        courseId,
        modelId,
        question: 'What is the perceptron model and how is it trained?',
      })
      .expect(201);
    expect(highChat.body.message.sourceType).toBe('course_material');
    expect(highChat.body.message.confidence).toBeGreaterThanOrEqual(0.45);
    expect(highChat.body.message.trace.tools?.length).toBeGreaterThan(0);
    expect(highChat.body.message.retrievedChunks.length).toBeGreaterThan(0);
    expect(highChat.body.message.modelDisplayName).toBe('Mock Tutor');

    const lowChat = await request(app)
      .post('/api/chat')
      .send({ courseId, modelId, question: 'Who won the 2018 FIFA World Cup?' })
      .expect(201);
    expect(lowChat.body.message.sourceType).toBe('model_knowledge');
    expect(lowChat.body.message.confidence).toBeLessThan(0.45);
    expect(lowChat.body.message.modelDisplayName).toBe('Mock Tutor');

    const feedback = await request(app)
      .patch(`/api/chat/${highChat.body.message.id}/feedback`)
      .send({ feedback: 'up' })
      .expect(200);
    expect(feedback.body.message.feedback).toBe('up');

    const settingsResponse = await request(app)
      .patch('/api/settings')
      .send({ highThreshold: 0.6, allowModelFallback: true, enableWebSearch: false })
      .expect(200);
    expect(settingsResponse.body.highThreshold).toBe(0.6);

    await request(app).delete(`/api/documents/${firstDocumentId}`).expect(204);
    const afterDelete = await request(app).get(`/api/courses/${courseId}/outline`).expect(200);
    expect(afterDelete.body.documents.find((document: { id: string }) => document.id === firstDocumentId)).toBeUndefined();
    const chunkCount = db
      .prepare('SELECT COUNT(*) AS count FROM chunks WHERE document_id = ?')
      .get(firstDocumentId) as { count: number };
    expect(Number(chunkCount.count)).toBe(0);

    await request(app).delete(`/api/models/${modelId}`).expect(204);
    const chatAfterModelDelete = await request(app).get(`/api/courses/${courseId}/chat`).expect(200);
    expect(chatAfterModelDelete.body.messages).toHaveLength(2);
    expect(chatAfterModelDelete.body.messages[0].modelDisplayName).toBe('Mock Tutor');

    expect(firstTopic.number).toBe('1.1');
    expect(firstTopic.sourceRefs[0].page).toBe(1);

    const chatCount = chatAfterModelDelete.body.messages.length;
    db.close();
    const reopened = openDatabase(
      path.join(tempDir, 'data', 'test.db'),
    );
    const persistedCourses = reopened.prepare('SELECT COUNT(*) AS count FROM courses').get() as {
      count: number;
    };
    const persistedChat = reopened.prepare('SELECT COUNT(*) AS count FROM chat_messages').get() as {
      count: number;
    };
    expect(Number(persistedCourses.count)).toBe(1);
    expect(Number(persistedChat.count)).toBe(chatCount);
    reopened.close();
  }, 60_000);
});

async function waitFor<T>(
  check: () => Promise<T | null>,
  timeoutMs = 20_000,
  intervalMs = 150,
): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timed out waiting for condition');
}
