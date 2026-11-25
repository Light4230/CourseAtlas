import { describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KeyStore } from '../server/security/key-store.js';
import { callChatCompletion } from '../server/services/llm-service.js';

describe('LLM empty-content retry', () => {
  it('retries once with thinking disabled when content is empty', async () => {
    let requests = 0;
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        const body = JSON.parse(raw) as { thinking?: { type?: string } };
        requests += 1;
        const content = requests === 1 ? '' : 'Recovered answer';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content,
                  reasoning_content: requests === 1 ? 'hidden reasoning' : undefined,
                },
                finish_reason: requests === 1 ? 'length' : 'stop',
              },
            ],
          }),
        );
        if (requests === 2) {
          expect(body.thinking?.type).toBe('disabled');
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const dir = mkdtempSync(path.join(os.tmpdir(), 'courseatlas-retry-'));
    const keyStore = new KeyStore('retry-test-secret', dir);
    const encrypted = keyStore.encrypt('fake-key');
    const model = {
      id: 'model',
      displayName: 'Retry model',
      provider: 'deepseek' as const,
      baseUrl: `http://127.0.0.1:${port}/v1`,
      modelId: 'deepseek-flash',
      apiKeyEncrypted: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyHint: '****',
    };
    try {
      const answer = await callChatCompletion(model, keyStore, [
        { role: 'user', content: 'test' },
      ]);
      expect(answer).toBe('Recovered answer');
      expect(requests).toBe(2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
