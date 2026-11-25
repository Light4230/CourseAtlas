import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * AES-256-GCM key storage. The master key comes from MODEL_KEY_SECRET when set;
 * otherwise a 32-byte local key is generated once under .secrets/ (gitignored).
 */
export class KeyStore {
  private readonly masterKey: Buffer;

  constructor(modelKeySecret: string | undefined, secretsDir: string) {
    this.masterKey = this.resolveMasterKey(modelKeySecret, secretsDir);
  }

  private resolveMasterKey(modelKeySecret: string | undefined, secretsDir: string): Buffer {
    if (modelKeySecret && modelKeySecret.length > 0) {
      return crypto.scryptSync(modelKeySecret, 'courseatlas-model-key-v1', 32);
    }
    const keyPath = path.join(secretsDir, 'model-key');
    fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
    if (fs.existsSync(keyPath)) {
      const raw = fs.readFileSync(keyPath, 'utf8').trim();
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length !== 32) {
        throw new Error('The local model encryption key is invalid. Remove .secrets/model-key only if you accept losing saved model keys.');
      }
      return decoded;
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, generated.toString('base64'), { mode: 0o600 });
    return generated;
  }

  encrypt(plaintext: string): EncryptedSecret {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(secret: EncryptedSecret): string {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.masterKey,
      Buffer.from(secret.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length < 8) {
    return '****';
  }
  const prefixMatch = trimmed.match(/^(sk|pk|tvly)-/i);
  const prefix = prefixMatch ? prefixMatch[1].toLowerCase() + '-' : '';
  return `${prefix}****${trimmed.slice(-4)}`;
}
