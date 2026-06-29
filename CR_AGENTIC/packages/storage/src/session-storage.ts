import { S3StorageClient } from './s3-client';
import { SessionCrypto } from './session-crypto';

export interface PlaywrightStorageState {
  cookies: unknown[];
  origins: unknown[];
}

export class SessionStorageService {
  constructor(
    private readonly s3: S3StorageClient,
    private readonly crypto: SessionCrypto,
  ) {}

  async saveSession(
    accountId: string,
    version: string,
    storageState: PlaywrightStorageState,
  ): Promise<string> {
    const encrypted = this.crypto.encryptJson(storageState);
    const key = this.s3.sessionKey(accountId, version);
    await this.s3.upload(key, encrypted, 'application/octet-stream');
    return key;
  }

  async loadSession(s3Key: string): Promise<PlaywrightStorageState> {
    const encrypted = await this.s3.download(s3Key);
    return this.crypto.decryptJson<PlaywrightStorageState>(encrypted);
  }

  async revokeSession(s3Key: string): Promise<void> {
    await this.s3.delete(s3Key);
  }
}
