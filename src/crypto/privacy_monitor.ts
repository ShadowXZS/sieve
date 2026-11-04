/**
 * Sieve Privacy Monitor & Zero-Telemetry Enforcement Engine (Phase 8)
 *
 * Provides runtime interception of network interfaces to guarantee absolute
 * zero-telemetry operations, client-side isolation, and deterministic
 * session cryptographic audit proof generation.
 */

export interface SessionAuditState {
  sessionId: string;
  timestamp: number;
  datasetRecordCount: number;
  totalWasteRecovered: number;
  exclusionsCount: number;
  platform: string;
  clientAppVersion: string;
  [key: string]: any;
}

export interface InterceptedDispatch {
  url: string;
  method: string;
  timestamp: number;
  blocked: boolean;
}

/**
 * Computes a deterministic SHA-256 audit proof hash representing the execution state.
 */
export async function generateSessionAuditHash(state: SessionAuditState): Promise<string> {
  // Sort keys alphabetically to guarantee canonical serialization
  const sortedKeys = Object.keys(state).sort();
  const canonicalObj: Record<string, any> = {};
  for (const k of sortedKeys) {
    canonicalObj[k] = state[k];
  }

  const jsonStr = JSON.stringify(canonicalObj);
  const enc = new TextEncoder().encode(jsonStr);
  const digestBuffer = await crypto.subtle.digest('SHA-256', enc);
  const hashArray = Array.from(new Uint8Array(digestBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class PrivacyMonitor {
  private originalFetch: typeof globalThis.fetch | null = null;
  private dispatches: InterceptedDispatch[] = [];
  private allowedOrigins: Set<string> = new Set();
  private isActive: boolean = false;

  constructor(allowedEndpoints: string[] = []) {
    for (const ep of allowedEndpoints) {
      try {
        const parsed = new URL(ep);
        this.allowedOrigins.add(parsed.origin.toLowerCase());
      } catch {
        this.allowedOrigins.add(ep.toLowerCase());
      }
    }
  }

  /**
   * Registers a user-configured client-side S3 endpoint to the whitelist.
   */
  public allowEndpoint(endpointUrl: string): void {
    try {
      const parsed = new URL(endpointUrl);
      this.allowedOrigins.add(parsed.origin.toLowerCase());
    } catch {
      this.allowedOrigins.add(endpointUrl.toLowerCase());
    }
  }

  /**
   * Activates zero-telemetry interception on global network APIs.
   */
  public start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.originalFetch = globalThis.fetch;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || (typeof input === 'object' && 'method' in input ? (input as any).method : 'GET');

      let isAllowed = false;
      try {
        const parsed = new URL(urlStr);
        if (this.allowedOrigins.has(parsed.origin.toLowerCase()) || this.allowedOrigins.has(parsed.hostname.toLowerCase())) {
          isAllowed = true;
        }
      } catch {
        // invalid URL treated as unallowed
      }

      const dispatchRecord: InterceptedDispatch = {
        url: urlStr,
        method: method.toUpperCase(),
        timestamp: Date.now(),
        blocked: !isAllowed,
      };

      this.dispatches.push(dispatchRecord);

      if (!isAllowed) {
        throw new Error(
          `Zero-Telemetry policy blocked external network dispatch to: ${urlStr}. Sieve runs strictly client-side without external telemetry.`
        );
      }

      if (this.originalFetch) {
        return await this.originalFetch(input, init);
      }
      throw new Error('Network unavailable');
    };
  }

  /**
   * Deactivates network interception and restores original handlers.
   */
  public stop(): void {
    if (!this.isActive) return;
    this.isActive = false;
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
      this.originalFetch = null;
    }
  }

  /**
   * Retrieves intercepted dispatch records.
   */
  public getDispatches(): InterceptedDispatch[] {
    return [...this.dispatches];
  }

  /**
   * Clears historical dispatch log.
   */
  public clearDispatches(): void {
    this.dispatches = [];
  }

  /**
   * Asserts whether zero unauthorized external dispatches occurred.
   */
  public isZeroTelemetryCompliant(): boolean {
    return this.dispatches.filter((d) => d.blocked).length === 0;
  }
}

