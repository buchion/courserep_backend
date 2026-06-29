import pino from 'pino';

export function createLogger(serviceName: string) {
  const isDev = process.env.NODE_ENV !== 'production';
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL ?? 'info',
    ...(isDev && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
    }),
    base: { service: serviceName },
  });
}

export type Logger = ReturnType<typeof createLogger>;
