import { chromium, Browser, BrowserContext } from 'playwright';
import { loadAgentEnv } from '@cr-agentic/config';
import {
  S3StorageClient,
  SessionCrypto,
  SessionStorageService,
} from '@cr-agentic/storage';

/**
 * Minimal Playwright wrapper for deep-scrape jobs. Loads an encrypted storage
 * state from S3 so the worker reuses the session captured during onboarding.
 */
export class DiscoveryBrowser {
  private browser: Browser | null = null;
  private readonly headless: boolean;

  constructor(
    private readonly sessionStorage: SessionStorageService,
    headless: boolean,
  ) {
    this.headless = headless;
  }

  async launch(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.headless });
    }
  }

  async contextFromSession(storageStateS3Key: string): Promise<BrowserContext> {
    if (!this.browser) await this.launch();
    const state = await this.sessionStorage.loadSession(storageStateS3Key);
    return this.browser!.newContext({ storageState: state as never });
  }

  async shutdown(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}

export function createDiscoveryBrowser(): DiscoveryBrowser {
  const env = loadAgentEnv();
  const s3 = new S3StorageClient(env);
  const crypto = new SessionCrypto(env.SESSION_ENCRYPTION_KEY);
  const sessionStorage = new SessionStorageService(s3, crypto);
  return new DiscoveryBrowser(sessionStorage, env.BROWSER_HEADLESS);
}
