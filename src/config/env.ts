/**
 * Sieve Environment Configuration & Runtime Schema Validator
 *
 * Enforces validated environment variables with safe defaults across browser
 * and worker/node execution environments. Zero hardcoded credentials.
 */

export interface AppConfig {
  appTitle: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'none';
  maxIngestMb: number;
  duckdbTimeoutMs: number;
  s3: {
    region: string;
    bucket: string;
    customEndpoint?: string;
  };
  isProduction: boolean;
  isTest: boolean;
}

function getEnvVar(key: string, fallback: string = ''): string {
  if (typeof import.meta !== 'undefined') {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
    if (metaEnv && metaEnv[key] !== undefined && metaEnv[key] !== '') {
      return metaEnv[key];
    }
  }
  if (typeof process !== 'undefined' && process.env) {
    const val = process.env[key];
    if (val !== undefined && val !== '') return val;
  }
  return fallback;
}

function parseNumber(raw: string, fallback: number): number {
  const num = parseInt(raw, 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

const rawLogLevel = getEnvVar('VITE_LOG_LEVEL', 'info').toLowerCase();
const validLogLevels = ['debug', 'info', 'warn', 'error', 'none'] as const;
const logLevel = (validLogLevels.includes(rawLogLevel as (typeof validLogLevels)[number])
  ? rawLogLevel
  : 'info') as AppConfig['logLevel'];

const isProduction = getEnvVar('NODE_ENV') === 'production' || getEnvVar('PROD') === 'true';
const isTest = getEnvVar('NODE_ENV') === 'test' || typeof process !== 'undefined' && !!process.env?.VITEST;

export const config: Readonly<AppConfig> = Object.freeze({
  appTitle: getEnvVar('VITE_APP_TITLE', 'Sieve'),
  logLevel,
  maxIngestMb: parseNumber(getEnvVar('VITE_MAX_INGEST_MB'), 600),
  duckdbTimeoutMs: parseNumber(getEnvVar('VITE_DUCKDB_TIMEOUT_MS'), 5000),
  s3: {
    region: getEnvVar('VITE_S3_REGION', 'us-east-1'),
    bucket: getEnvVar('VITE_S3_BUCKET', ''),
    customEndpoint: getEnvVar('VITE_S3_CUSTOM_ENDPOINT') || undefined,
  },
  isProduction,
  isTest,
});
