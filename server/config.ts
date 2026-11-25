import fs from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  port: number;
  uploadsDir: string;
  dataDir: string;
  databasePath: string;
  secretsDir: string;
  modelKeySecret: string | undefined;
  tavilyApiKey: string | undefined;
  allowLocalModels: boolean;
  maxUploadMb: number;
  clientDir: string;
}

function loadDotEnvIfPresent(): void {
  // Node 24 provides process.loadEnvFile. Runtime files are loaded before app setup.
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // A malformed local .env should not stop the server from starting.
    }
  }
}

export function readConfig(): AppConfig {
  loadDotEnvIfPresent();
  const dataDir = path.resolve(process.env.COURSEATLAS_DATA_DIR ?? 'data');
  const uploadsDir = path.resolve(process.env.COURSEATLAS_UPLOADS_DIR ?? 'uploads');
  const secretsDir = path.resolve(process.env.COURSEATLAS_SECRETS_DIR ?? '.secrets');
  return {
    port: Number(process.env.PORT ?? 3001),
    uploadsDir,
    dataDir,
    databasePath: path.join(dataDir, 'courseatlas.db'),
    secretsDir,
    modelKeySecret: process.env.MODEL_KEY_SECRET?.trim() || undefined,
    tavilyApiKey: process.env.TAVILY_API_KEY?.trim() || undefined,
    allowLocalModels: process.env.ALLOW_LOCAL_MODELS === 'true',
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 20),
    clientDir: path.resolve(process.cwd(), 'dist/client'),
  };
}
