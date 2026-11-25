import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { AppContext } from './context.js';
import { ApiError, asyncHandler, errorHandler, notFoundHandler } from './lib/errors.js';
import { createCourse, deleteCourse, getCourse, listCourses, removeFiles, updateCourse } from './services/course-service.js';
import {
  createDocumentWithLecture,
  deleteDocument,
  getDocument,
  listDocuments,
  resetDocumentForRetry,
  titleFromFilename,
  updateLectureTitle,
} from './services/document-service.js';
import {
  getOutline,
  getTopic,
  mergeWithNext,
  regenerateLectureOutline,
  splitTopic,
  updateTopic,
} from './services/outline-service.js';
import { createModel, deleteModel, getModelWithSecret, listModels } from './services/model-service.js';
import {
  answerQuestion,
  clearChat,
  listChatMessages,
  setChatFeedback,
} from './services/chat-service.js';
import { getSettings, updateSettings } from './services/settings-service.js';
import { isSearchConfigured } from './services/search-service.js';

const courseCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
const courseUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })
  .refine((value) => value.name !== undefined || value.color !== undefined, {
    message: 'At least one field is required.',
  });
const topicUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    summary: z.string().max(1200).optional(),
    summaryEn: z.string().max(1200).optional(),
    summaryZh: z.string().max(1200).optional(),
    keywords: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.summary !== undefined ||
      value.summaryEn !== undefined ||
      value.summaryZh !== undefined ||
      value.keywords !== undefined,
    { message: 'At least one field is required.' },
  );
const modelCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  provider: z.enum(['deepseek', 'openai-compatible']),
  baseUrl: z.string().trim().min(1).max(300),
  modelId: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(4).max(500),
});
const settingsSchema = z
  .object({
    highThreshold: z.number().min(0.1).max(0.95).optional(),
    allowModelFallback: z.boolean().optional(),
    enableWebSearch: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one setting is required.' });

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'CourseAtlas',
      version: '0.1.0',
      searchConfigured: isSearchConfigured(ctx.config.tavilyApiKey),
    });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      searchConfigured: isSearchConfigured(ctx.config.tavilyApiKey),
      searchProvider: isSearchConfigured(ctx.config.tavilyApiKey) ? 'tavily' : null,
      allowLocalModels: ctx.config.allowLocalModels,
      maxUploadMb: ctx.config.maxUploadMb,
    });
  });

  app.get(
    '/api/courses',
    asyncHandler(async (_req, res) => {
      res.json({ courses: listCourses(ctx.db) });
    }),
  );

  app.post(
    '/api/courses',
    asyncHandler(async (req, res) => {
      const input = courseCreateSchema.parse(req.body);
      res.status(201).json({ course: createCourse(ctx.db, input) });
    }),
  );

  app.patch(
    '/api/courses/:id',
    asyncHandler(async (req, res) => {
      const input = courseUpdateSchema.parse(req.body);
      res.json({ course: updateCourse(ctx.db, req.params.id, input) });
    }),
  );

  app.delete(
    '/api/courses/:id',
    asyncHandler(async (req, res) => {
      const storedPaths = deleteCourse(ctx.db, req.params.id);
      removeFiles(ctx.config.uploadsDir, storedPaths);
      res.status(204).end();
    }),
  );

  app.get(
    '/api/courses/:id/outline',
    asyncHandler(async (req, res) => {
      res.json(getOutline(ctx.db, req.params.id));
    }),
  );

  app.get(
    '/api/courses/:id/documents',
    asyncHandler(async (req, res) => {
      getCourse(ctx.db, req.params.id);
      res.json({ documents: listDocuments(ctx.db, req.params.id) });
    }),
  );

  app.post(
    '/api/courses/:id/documents',
    (req, res, next) => {
      try {
        getCourse(ctx.db, req.params.id);
        uploadPdfs(ctx)(req, res, next);
      } catch (error) {
        next(error);
      }
    },
    asyncHandler(async (req, res) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        throw new ApiError(400, 'NO_FILES', 'Choose at least one PDF file.');
      }
      const accepted: Array<{ id: string; lectureId: string; filename: string }> = [];
      const outlineModelId =
        typeof req.body?.outlineModelId === 'string' && req.body.outlineModelId.trim()
          ? req.body.outlineModelId.trim()
          : null;
      let outlineModelName: string | null = null;
      if (outlineModelId) {
        try {
          outlineModelName = getModelWithSecret(ctx.db, outlineModelId).displayName;
        } catch {
          removeFiles(ctx.config.uploadsDir, files.map((file) => file.filename));
          throw new ApiError(404, 'MODEL_NOT_FOUND', 'The selected outline model was not found.');
        }
      }
      try {
        for (const file of files) {
          const filename = normaliseOriginalFilename(file.originalname);
          const id = crypto.randomUUID();
          const created = createDocumentWithLecture(ctx.db, {
            id,
            courseId: req.params.id,
            filename,
            storedPath: file.filename,
            mimeType: file.mimetype || 'application/pdf',
            sizeBytes: file.size,
            lectureTitle: titleFromFilename(filename),
            outlineModelId,
            outlineModelName,
          });
          accepted.push({ id: created.documentId, lectureId: created.lectureId, filename });
        }
      } catch (error) {
        removeFiles(ctx.config.uploadsDir, files.map((file) => file.filename));
        throw error;
      }
      for (const item of accepted) {
        ctx.queue.enqueue(item.id);
      }
      res.status(202).json({
        documents: listDocuments(ctx.db, req.params.id).filter((document) =>
          accepted.some((item) => item.id === document.id),
        ),
      });
    }),
  );

  app.delete(
    '/api/documents/:id',
    asyncHandler(async (req, res) => {
      const deleted = deleteDocument(ctx.db, req.params.id);
      removeFiles(ctx.config.uploadsDir, [deleted.storedPath]);
      res.status(204).end();
    }),
  );

  app.post(
    '/api/documents/:id/retry',
    asyncHandler(async (req, res) => {
      const document = resetDocumentForRetry(ctx.db, req.params.id);
      ctx.queue.enqueue(document.id);
      res.status(202).json({ document });
    }),
  );

  app.get(
    '/api/documents/:id/pages/:page',
    asyncHandler(async (req, res) => {
      const document = getDocument(ctx.db, req.params.id);
      const page = Number(req.params.page);
      if (!Number.isInteger(page) || page < 1 || page > (document.pageCount ?? 0)) {
        throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Page not found.');
      }
      const chunks = ctx.db
        .prepare('SELECT text FROM chunks WHERE document_id = ? AND page = ? ORDER BY chunk_index ASC')
        .all(document.id, page) as Array<{ text: string }>;
      if (chunks.length === 0) {
        throw new ApiError(
          404,
          'NO_TEXT_LAYER',
          'This page has no extracted text. OCR is not implemented.',
        );
      }
      res.json({
        documentId: document.id,
        filename: document.filename,
        page,
        text: chunks.map((chunk) => chunk.text).join('\n\n'),
      });
    }),
  );

  app.get(
    '/api/documents/:id/file',
    asyncHandler(async (req, res) => {
      const document = getDocument(ctx.db, req.params.id);
      const uploadsRoot = path.resolve(ctx.config.uploadsDir);
      const absolute = path.resolve(uploadsRoot, document.storedPath);
      if (!absolute.startsWith(uploadsRoot + path.sep) || !fs.existsSync(absolute)) {
        throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'The stored PDF could not be found.');
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
      );
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.sendFile(absolute);
    }),
  );

  app.patch(
    '/api/lectures/:id',
    asyncHandler(async (req, res) => {
      const input = z.object({ title: z.string().trim().min(1).max(160) }).parse(req.body);
      updateLectureTitle(ctx.db, req.params.id, input.title);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/courses/:id/lectures/:lectureId/outline/regenerate',
    asyncHandler(async (req, res) => {
      const input = z
        .object({
          mode: z.enum(['ai', 'local']).optional(),
          modelId: z.string().uuid().optional(),
          preserveManualEdits: z.boolean().default(false),
        })
        .parse(req.body ?? {});
      getCourse(ctx.db, req.params.id);
      const lecture = ctx.db
        .prepare('SELECT id FROM lectures WHERE id = ? AND course_id = ?')
        .get(req.params.lectureId, req.params.id);
      if (!lecture) throw new ApiError(404, 'LECTURE_NOT_FOUND', 'Lecture not found in this course.');
      const mode = input.mode ?? (input.modelId ? 'ai' : 'local');
      if (mode === 'ai' && !input.modelId) {
        throw new ApiError(400, 'MODEL_REQUIRED', 'Select a model to generate an AI outline.');
      }
      const ai =
        mode === 'ai' && input.modelId
          ? {
              model: getModelWithSecret(ctx.db, input.modelId),
              keyStore: ctx.keyStore,
            }
          : undefined;
      const outline = await regenerateLectureOutline(
        ctx.db,
        ctx.config.uploadsDir,
        req.params.lectureId,
        {
          mode,
          preserveManualEdits: input.preserveManualEdits,
          ai,
        },
      );
      res.json({ lecture: outline });
    }),
  );

  app.patch(
    '/api/topics/:id',
    asyncHandler(async (req, res) => {
      const input = topicUpdateSchema.parse(req.body);
      res.json({ topic: updateTopic(ctx.db, req.params.id, input) });
    }),
  );

  app.post(
    '/api/topics/:id/merge-next',
    asyncHandler(async (req, res) => {
      const input = z.object({ title: z.string().trim().min(1).max(200).optional() }).parse(req.body ?? {});
      res.json({ topic: mergeWithNext(ctx.db, req.params.id, input) });
    }),
  );

  app.post(
    '/api/topics/:id/split',
    asyncHandler(async (req, res) => {
      const input = z
        .object({
          title: z.string().trim().min(1).max(160),
          keptSourceRefs: z.number().int().min(1).max(10),
        })
        .parse(req.body);
      res.status(201).json(splitTopic(ctx.db, req.params.id, input));
    }),
  );

  app.get(
    '/api/models',
    asyncHandler(async (_req, res) => {
      res.json({ models: listModels(ctx.db) });
    }),
  );

  app.post(
    '/api/models',
    asyncHandler(async (req, res) => {
      const input = modelCreateSchema.parse(req.body);
      const model = createModel(ctx.db, ctx.keyStore, input, {
        allowLocalModels: ctx.config.allowLocalModels,
      });
      res.status(201).json({ model });
    }),
  );

  app.delete(
    '/api/models/:id',
    asyncHandler(async (req, res) => {
      deleteModel(ctx.db, req.params.id);
      res.status(204).end();
    }),
  );

  app.post(
    '/api/chat',
    asyncHandler(async (req, res) => {
      const input = z
        .object({
          courseId: z.string().uuid(),
          modelId: z.string().uuid(),
          question: z.string().trim().min(1).max(2000),
          lectureId: z.string().uuid().optional(),
        })
        .parse(req.body);
      const message = await answerQuestion(ctx, input);
      res.status(201).json({ message });
    }),
  );

  app.get(
    '/api/courses/:id/chat',
    asyncHandler(async (req, res) => {
      res.json({ messages: listChatMessages(ctx.db, req.params.id) });
    }),
  );

  app.patch(
    '/api/chat/:id/feedback',
    asyncHandler(async (req, res) => {
      const input = z.object({ feedback: z.enum(['up', 'down']).nullable() }).parse(req.body);
      res.json({ message: setChatFeedback(ctx.db, req.params.id, input.feedback) });
    }),
  );

  app.delete(
    '/api/courses/:id/chat',
    asyncHandler(async (req, res) => {
      clearChat(ctx.db, req.params.id);
      res.status(204).end();
    }),
  );

  app.get(
    '/api/settings',
    asyncHandler(async (_req, res) => {
      res.json({
        ...getSettings(ctx.db),
        searchConfigured: isSearchConfigured(ctx.config.tavilyApiKey),
        searchProvider: isSearchConfigured(ctx.config.tavilyApiKey) ? 'tavily' : null,
      });
    }),
  );

  app.patch(
    '/api/settings',
    asyncHandler(async (req, res) => {
      const input = settingsSchema.parse(req.body);
      res.json({
        ...updateSettings(ctx.db, input),
        searchConfigured: isSearchConfigured(ctx.config.tavilyApiKey),
        searchProvider: isSearchConfigured(ctx.config.tavilyApiKey) ? 'tavily' : null,
      });
    }),
  );

  app.use('/api', notFoundHandler);

  if (fs.existsSync(path.join(ctx.config.clientDir, 'index.html'))) {
    app.use(express.static(ctx.config.clientDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(ctx.config.clientDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.status(200).send('CourseAtlas API is running. Start the Vite client with npm run dev:web.');
    });
  }

  app.use(errorHandler);
  return app;
}

function uploadPdfs(ctx: AppContext) {
  const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
      fs.mkdirSync(ctx.config.uploadsDir, { recursive: true });
      callback(null, ctx.config.uploadsDir);
    },
    filename: (_req, _file, callback) => {
      callback(null, `${crypto.randomUUID()}.pdf`);
    },
  });
  const upload = multer({
    storage,
    limits: {
      fileSize: ctx.config.maxUploadMb * 1024 * 1024,
      files: 20,
    },
    fileFilter: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const mime = (file.mimetype || '').toLowerCase();
      const allowedMime = ['application/pdf', 'application/x-pdf', 'application/octet-stream'];
      if (extension !== '.pdf' || !allowedMime.includes(mime)) {
        callback(new Error('NOT_PDF'));
        return;
      }
      callback(null, true);
    },
  });

  return (req: Request, res: Response, next: NextFunction) => {
    upload.array('files', 20)(req, res, (error) => {
      if (error) {
        cleanupRequestFiles(ctx, req);
        next(error);
        return;
      }
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      for (const file of files) {
        try {
          const header = fs.readFileSync(file.path).subarray(0, 5).toString('ascii');
          if (header !== '%PDF-') {
            cleanupRequestFiles(ctx, req);
            next(new ApiError(400, 'NOT_PDF', 'The uploaded file is not a valid PDF.'));
            return;
          }
        } catch {
          cleanupRequestFiles(ctx, req);
          next(new ApiError(422, 'PARSE_FAILED', 'The uploaded PDF could not be read.'));
          return;
        }
      }
      next();
    });
  };
}

function cleanupRequestFiles(ctx: AppContext, req: Request): void {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  removeFiles(
    ctx.config.uploadsDir,
    files.map((file) => file.filename),
  );
}

function normaliseOriginalFilename(original: string): string {
  let decoded = original;
  try {
    const candidate = Buffer.from(original, 'latin1').toString('utf8');
    if (!candidate.includes('\uFFFD')) decoded = candidate;
  } catch {
    decoded = original;
  }
  const base = path.basename(decoded).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  return (base || 'document.pdf').slice(0, 180);
}
