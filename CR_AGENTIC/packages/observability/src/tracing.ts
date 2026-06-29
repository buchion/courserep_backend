export interface Span {
  name: string;
  startTime: number;
  attributes: Record<string, string | number>;
  end(): void;
}

export function startSpan(
  name: string,
  attributes: Record<string, string | number> = {},
): Span {
  const startTime = Date.now();
  return {
    name,
    startTime,
    attributes,
    end() {
      const duration = Date.now() - startTime;
      if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
        // OTLP export hook point for Phase 2 wiring
      }
      if (process.env.LOG_LEVEL === 'debug') {
        console.debug(`[trace] ${name} ${duration}ms`, attributes);
      }
    },
  };
}
