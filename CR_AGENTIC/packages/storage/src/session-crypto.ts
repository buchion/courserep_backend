import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT = 'cr-agent-session-v1';

export class SessionCrypto {
  private readonly key: Buffer;

  constructor(encryptionKey: string) {
    this.key = scryptSync(encryptionKey, SALT, 32);
  }

  encrypt(plaintext: Buffer | string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const input = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
  }

  decrypt(payload: Buffer): Buffer {
    const iv = payload.subarray(0, IV_LENGTH);
    const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const data = payload.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  encryptJson(value: unknown): Buffer {
    return this.encrypt(JSON.stringify(value));
  }

  decryptJson<T>(payload: Buffer): T {
    const json = this.decrypt(payload).toString('utf8');
    return JSON.parse(json) as T;
  }
}
