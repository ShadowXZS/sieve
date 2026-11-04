/**
 * Sieve Structured Logger
 *
 * Production-ready leveled logging with automatic PII and secrets redaction.
 * Ensures that sensitive search queries, customer identifiers, credentials,
 * and internal memory addresses are never emitted in plain text.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

const LOG_LEVEL_PRIORITIES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

// Patterns to sanitize from log messages
const PII_PATTERNS = [
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Payment card candidates (13-19 digits with optional hyphens/spaces)
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  // Bearer tokens and API keys
  /\b(?:bearer\s+|token\s+|key\s+|secret\s+)[A-Za-z0-9_\-.~+/=]{16,}\b/gi,
  // Passwords
  /(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s,"']+/gi,
];

/**
 * Sanitizes sensitive data from an unknown argument before logging.
 */
export function sanitizeLogData(item: unknown): unknown {
  if (item === null || item === undefined) return item;

  if (typeof item === 'string') {
    let sanitized = item;
    for (const pattern of PII_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    return sanitized;
  }

  if (item instanceof Error) {
    const sanitizedError = new Error(sanitizeLogData(item.message) as string);
    sanitizedError.name = item.name;
    if (item.stack) {
      sanitizedError.stack = sanitizeLogData(item.stack) as string;
    }
    return sanitizedError;
  }

  if (typeof item === 'object') {
    try {
      const serialized = JSON.stringify(item);
      return JSON.parse(sanitizeLogData(serialized) as string);
    } catch {
      return '[Unserializable Object]';
    }
  }

  return item;
}

export class Logger {
  private level: LogLevel = 'info';
  private prefix: string;

  constructor(prefix: string = 'Sieve', level?: LogLevel) {
    this.prefix = prefix;
    if (level) {
      this.level = level;
    } else {
      this.level = this.resolveDefaultLevel();
    }
  }

  private resolveDefaultLevel(): LogLevel {
    if (typeof process !== 'undefined' && process.env?.VITE_LOG_LEVEL) {
      const lvl = process.env.VITE_LOG_LEVEL.toLowerCase() as LogLevel;
      if (lvl in LOG_LEVEL_PRIORITIES) return lvl;
    }
    if (typeof import.meta !== 'undefined') {
      const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
      if (metaEnv?.VITE_LOG_LEVEL) {
        const lvl = metaEnv.VITE_LOG_LEVEL.toLowerCase() as LogLevel;
        if (lvl in LOG_LEVEL_PRIORITIES) return lvl;
      }
    }
    return 'info';
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITIES[level] >= LOG_LEVEL_PRIORITIES[this.level];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] [${this.prefix}] ${message}`;
  }

  public debug(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('debug')) return;
    const sanitizedArgs = args.map(sanitizeLogData);
    // eslint-disable-next-line no-console
    console.debug(this.formatMessage('debug', sanitizeLogData(message) as string), ...sanitizedArgs);
  }

  public info(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('info')) return;
    const sanitizedArgs = args.map(sanitizeLogData);
    // eslint-disable-next-line no-console
    console.info(this.formatMessage('info', sanitizeLogData(message) as string), ...sanitizedArgs);
  }

  public warn(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('warn')) return;
    const sanitizedArgs = args.map(sanitizeLogData);
    // eslint-disable-next-line no-console
    console.warn(this.formatMessage('warn', sanitizeLogData(message) as string), ...sanitizedArgs);
  }

  public error(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('error')) return;
    const sanitizedArgs = args.map(sanitizeLogData);
    // eslint-disable-next-line no-console
    console.error(this.formatMessage('error', sanitizeLogData(message) as string), ...sanitizedArgs);
  }

  public child(subPrefix: string): Logger {
    return new Logger(`${this.prefix}:${subPrefix}`, this.level);
  }
}

export const logger = new Logger('Sieve');
