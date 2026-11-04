/**
 * Sieve Direct Client-Side AWS SigV4 S3 Sync Service (Phase 8)
 *
 * Implements client-side authenticated S3 object uploads without intermediate servers.
 * Computes canonical request hashes, HMAC-SHA256 signing keys, and AWS4-HMAC-SHA256 authorization.
 */

export interface S3SyncConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
  customEndpoint?: string;
}

export interface S3UploadResult {
  success: boolean;
  status: number;
  url: string;
  etag?: string;
  timestamp: number;
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: Uint8Array, message: string | Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBytes as unknown as BufferSource);
  return new Uint8Array(signature);
}

function getAmzDatetime(override?: string): { datetime: string; dateStamp: string } {
  if (override) {
    return {
      datetime: override,
      dateStamp: override.slice(0, 8),
    };
  }
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');

  const dateStamp = `${year}${month}${day}`;
  const datetime = `${dateStamp}T${hours}${minutes}${seconds}Z`;
  return { datetime, dateStamp };
}

/**
 * Computes AWS SigV4 signed headers for an S3 PUT object request.
 */
export async function computeAwsSigV4Headers(
  config: S3SyncConfig,
  filename: string,
  payload: Uint8Array,
  datetimeOverride?: string
): Promise<Record<string, string>> {
  const { datetime, dateStamp } = getAmzDatetime(datetimeOverride);

  // 1. Determine host and key path
  const host = config.customEndpoint
    ? new URL(config.customEndpoint).host
    : `${config.bucket}.s3.${config.region}.amazonaws.com`;

  const cleanPrefix = config.prefix ? config.prefix.replace(/^\/+|\/+$/g, '') : '';
  const keyPath = cleanPrefix ? `${cleanPrefix}/${filename}` : filename;
  const canonicalUri = `/${encodeURI(keyPath).replace(/#/g, '%23')}`;

  // 2. Hash payload
  const contentSha256 = await sha256Hex(payload);

  // 3. Construct canonical request
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${contentSha256}\nx-amz-date:${datetime}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '', // query string
    canonicalHeaders,
    signedHeaders,
    contentSha256,
  ].join('\n');

  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);

  // 4. Construct string to sign
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    datetime,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  // 5. Derive signing key
  const kSecret = new TextEncoder().encode(`AWS4${config.secretAccessKey}`);
  const kDate = await hmacSha256(kSecret, dateStamp);
  const kRegion = await hmacSha256(kDate, config.region);
  const kService = await hmacSha256(kRegion, 's3');
  const kSigning = await hmacSha256(kService, 'aws4_request');

  // 6. Calculate signature
  const signatureBytes = await hmacSha256(kSigning, stringToSign);
  const signature = Array.from(signatureBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // 7. Formulate authorization header
  const authHeader = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authHeader,
    'x-amz-date': datetime,
    'x-amz-content-sha256': contentSha256,
    host,
    'Content-Type': 'application/octet-stream',
  };
}

/**
 * Directly uploads an encrypted vault payload to S3 from the browser client.
 * Enforces strict request timeout to prevent hanging connections.
 */
export async function uploadVaultToS3(
  config: S3SyncConfig,
  payload: Uint8Array,
  filename: string,
  timeoutMs: number = 15000
): Promise<S3UploadResult> {
  const cleanPrefix = config.prefix ? config.prefix.replace(/^\/+|\/+$/g, '') : '';
  const keyPath = cleanPrefix ? `${cleanPrefix}/${filename}` : filename;

  const endpointUrl = config.customEndpoint
    ? `${config.customEndpoint.replace(/\/+$/, '')}/${keyPath}`
    : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${keyPath}`;

  const headers = await computeAwsSigV4Headers(config, filename, payload);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpointUrl, {
      method: 'PUT',
      headers,
      body: payload as unknown as BodyInit,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`S3 upload failed with HTTP ${response.status}: ${response.statusText}`);
    }

    return {
      success: true,
      status: response.status,
      url: endpointUrl,
      etag: response.headers?.get('ETag') || undefined,
      timestamp: Date.now(),
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`S3 upload timed out after ${timeoutMs}ms: request aborted`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

