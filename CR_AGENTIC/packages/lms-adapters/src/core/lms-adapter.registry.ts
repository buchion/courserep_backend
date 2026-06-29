import { LmsType } from '@cr-agentic/shared';
import { ILmsAdapter } from './lms-adapter.interface';

export class LmsAdapterRegistry {
  private readonly adapters = new Map<LmsType, ILmsAdapter>();

  register(adapter: ILmsAdapter): void {
    this.adapters.set(adapter.lmsType, adapter);
  }

  get(lmsType: LmsType): ILmsAdapter {
    const adapter = this.adapters.get(lmsType);
    if (!adapter) {
      throw new Error(`No LMS adapter registered for type: ${lmsType}`);
    }
    return adapter;
  }

  list(): ILmsAdapter[] {
    return Array.from(this.adapters.values());
  }
}

export const defaultLmsRegistry = new LmsAdapterRegistry();
