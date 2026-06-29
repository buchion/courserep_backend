import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { loadAgentEnv } from '@cr-agentic/config';
import { SessionStorageService, S3StorageClient, SessionCrypto } from '@cr-agentic/storage';
import { createLogger } from '@cr-agentic/observability';

export class BrowserController {
  private browser: Browser | null = null;
  private readonly logger = createLogger('browser-controller');
  private readonly headless: boolean;
  private readonly maxContexts: number;
  private activeContexts = 0;

  constructor(
    private readonly sessionStorage: SessionStorageService,
    env?: ReturnType<typeof loadAgentEnv>,
  ) {
    const config = env ?? loadAgentEnv();
    this.headless = config.BROWSER_HEADLESS;
    this.maxContexts = config.BROWSER_MAX_CONTEXTS;
  }

  async launch(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({ headless: this.headless });
    this.logger.info({ headless: this.headless }, 'Browser launched');
  }

  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private ensureBrowser(): Browser {
    if (!this.browser) throw new Error('Browser not launched');
    return this.browser;
  }

  async createContext(storageStateS3Key?: string): Promise<BrowserContext> {
    if (this.activeContexts >= this.maxContexts) {
      throw new Error('Browser context pool exhausted');
    }
    this.activeContexts++;
    const browser = this.ensureBrowser();

    if (storageStateS3Key) {
      const state = await this.sessionStorage.loadSession(storageStateS3Key);
      return browser.newContext({ storageState: state as never });
    }

    return browser.newContext();
  }

  async releaseContext(context: BrowserContext): Promise<void> {
    await context.close();
    this.activeContexts = Math.max(0, this.activeContexts - 1);
  }

  async persistSession(
    accountId: string,
    context: BrowserContext,
  ): Promise<{ s3Key: string; expiresAt: Date }> {
    const state = await context.storageState();
    const version = Date.now().toString();
    const s3Key = await this.sessionStorage.saveSession(accountId, version, state);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return { s3Key, expiresAt };
  }

  async captureScreenshot(page: Page, taskRunId: string, s3: S3StorageClient, name: string) {
    const buffer = await page.screenshot({ fullPage: true });
    const key = s3.screenshotKey(taskRunId, name);
    await s3.upload(key, buffer, 'image/png');
    return key;
  }
}

export function createBrowserStack() {
  const env = loadAgentEnv();
  const s3 = new S3StorageClient(env);
  const crypto = new SessionCrypto(env.SESSION_ENCRYPTION_KEY);
  const sessionStorage = new SessionStorageService(s3, crypto);
  const controller = new BrowserController(sessionStorage, env);
  return { controller, s3, sessionStorage, env };
}
