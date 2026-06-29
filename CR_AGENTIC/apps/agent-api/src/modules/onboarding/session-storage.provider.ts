import { Provider } from '@nestjs/common';
import { loadAgentEnv } from '@cr-agentic/config';
import {
  S3StorageClient,
  SessionCrypto,
  SessionStorageService,
} from '@cr-agentic/storage';

export const SESSION_STORAGE = 'SESSION_STORAGE';

export const sessionStorageProvider: Provider = {
  provide: SESSION_STORAGE,
  useFactory: (): SessionStorageService => {
    const env = loadAgentEnv();
    const s3 = new S3StorageClient(env);
    const crypto = new SessionCrypto(env.SESSION_ENCRYPTION_KEY);
    return new SessionStorageService(s3, crypto);
  },
};
