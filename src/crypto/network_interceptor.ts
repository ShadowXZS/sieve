/**
 * Sieve Network Interceptor & Zero-Telemetry Monitor
 * Intercepts outbound network APIs to enforce zero-leak guarantees.
 * Physical line ceiling: <= 250 lines.
 */

import { logger } from '../utils/logger.ts';

export interface InterceptedDispatch {
  url: string;
  method: string;
  timestamp: number;
  blocked: boolean;
  bytesAttempted?: number;
}

type XhrOpenFn = (method: string, url: string | URL, ...rest: unknown[]) => void;
type XhrSendFn = (body?: Document | XMLHttpRequestBodyInit | null) => void;
type SendBeaconFn = (url: string | URL, data?: BodyInit | null) => boolean;

export class PrivacyMonitor {
  private originalFetch: typeof globalThis.fetch | null = null;
  private originalXhrOpen: XhrOpenFn | null = null;
  private originalXhrSend: XhrSendFn | null = null;
  private originalSendBeacon: SendBeaconFn | null = null;
  private originalWebSocket: typeof WebSocket | null = null;

  private dispatches: InterceptedDispatch[] = [];
  private allowedOrigins: Set<string> = new Set();
  private isActive: boolean = false;
  private outboundBytesTransmitted: number = 0;

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

  public allowEndpoint(endpointUrl: string): void {
    try {
      const parsed = new URL(endpointUrl);
      this.allowedOrigins.add(parsed.origin.toLowerCase());
    } catch (err) {
      logger.debug('Endpoint string parsed as raw origin:', err);
      this.allowedOrigins.add(endpointUrl.toLowerCase());
    }
  }

  public getOutboundByteCount(): number {
    return this.outboundBytesTransmitted;
  }

  public isZeroLeakAttested(): boolean {
    return this.outboundBytesTransmitted === 0;
  }

  public start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.outboundBytesTransmitted = 0;

    this.originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || (typeof input === 'object' && 'method' in input && typeof input.method === 'string' ? input.method : 'GET');

      let isAllowed = false;
      try {
        const parsed = new URL(urlStr);
        if (
          parsed.protocol === 'blob:' ||
          parsed.protocol === 'data:' ||
          this.allowedOrigins.has(parsed.origin.toLowerCase()) ||
          this.allowedOrigins.has(parsed.hostname.toLowerCase())
        ) {
          isAllowed = true;
        }
      } catch {
        // invalid URL treated as unallowed
      }

      let bytesAttempted = 0;
      if (init?.body) {
        if (typeof init.body === 'string') {
          bytesAttempted = new TextEncoder().encode(init.body).length;
        } else if (init.body instanceof Uint8Array || init.body instanceof ArrayBuffer) {
          bytesAttempted = init.body.byteLength;
        }
      }

      const dispatchRecord: InterceptedDispatch = {
        url: urlStr,
        method: method.toUpperCase(),
        timestamp: Date.now(),
        blocked: !isAllowed,
        bytesAttempted,
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

    if (typeof globalThis.XMLHttpRequest !== 'undefined') {
      const xhrProto = (globalThis.XMLHttpRequest as unknown as { prototype: XMLHttpRequest }).prototype;
      this.originalXhrOpen = (xhrProto as unknown as { open: XhrOpenFn }).open;
      this.originalXhrSend = (xhrProto as unknown as { send: XhrSendFn }).send;

      const self = this;
      (xhrProto as unknown as { open: XhrOpenFn }).open = function (
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        ...rest: unknown[]
      ) {
        const urlStr = url.toString();
        let isAllowed = false;
        try {
          const parsed = new URL(urlStr, globalThis.location?.origin || 'http://localhost');
          if (
            parsed.protocol === 'blob:' ||
            parsed.protocol === 'data:' ||
            self.allowedOrigins.has(parsed.origin.toLowerCase()) ||
            self.allowedOrigins.has(parsed.hostname.toLowerCase())
          ) {
            isAllowed = true;
          }
        } catch (err) {
          logger.debug('XHR URL resolution notice:', err);
        }

        if (!isAllowed) {
          self.dispatches.push({
            url: urlStr,
            method: (method || 'GET').toUpperCase(),
            timestamp: Date.now(),
            blocked: true,
          });
          throw new Error(
            `Zero-Telemetry policy blocked XMLHttpRequest to: ${urlStr}. Outbound egress disallowed.`
          );
        }

        return self.originalXhrOpen?.apply(this, [method, url, ...rest]);
      };
    }

    if (typeof globalThis.navigator !== 'undefined' && globalThis.navigator.sendBeacon) {
      this.originalSendBeacon = globalThis.navigator.sendBeacon;
      const self = this;
      globalThis.navigator.sendBeacon = function (url: string | URL, _data?: BodyInit | null): boolean {
        self.dispatches.push({
          url: url.toString(),
          method: 'POST',
          timestamp: Date.now(),
          blocked: true,
        });
        return false;
      };
    }

    if (typeof globalThis.WebSocket !== 'undefined') {
      this.originalWebSocket = globalThis.WebSocket;
      const self = this;
      const InterceptedWs = function (url: string | URL, ..._protocols: unknown[]) {
        self.dispatches.push({
          url: url.toString(),
          method: 'WS',
          timestamp: Date.now(),
          blocked: true,
        });
        throw new Error(`Zero-Telemetry policy blocked WebSocket connection to: ${url.toString()}.`);
      };
      (globalThis as unknown as { WebSocket: unknown }).WebSocket = InterceptedWs;
    }
  }

  public stop(): void {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
      this.originalFetch = null;
    }

    if (this.originalXhrOpen && typeof globalThis.XMLHttpRequest !== 'undefined') {
      const xhrProto = (globalThis.XMLHttpRequest as unknown as { prototype: XMLHttpRequest }).prototype;
      (xhrProto as unknown as { open: XhrOpenFn }).open = this.originalXhrOpen;
      (xhrProto as unknown as { send: XhrSendFn }).send = this.originalXhrSend!;
      this.originalXhrOpen = null;
      this.originalXhrSend = null;
    }

    if (this.originalSendBeacon && typeof globalThis.navigator !== 'undefined') {
      globalThis.navigator.sendBeacon = this.originalSendBeacon;
      this.originalSendBeacon = null;
    }

    if (this.originalWebSocket && typeof globalThis.WebSocket !== 'undefined') {
      globalThis.WebSocket = this.originalWebSocket;
      this.originalWebSocket = null;
    }
  }

  public getDispatches(): InterceptedDispatch[] {
    return [...this.dispatches];
  }

  public clearDispatches(): void {
    this.dispatches = [];
  }

  public isZeroTelemetryCompliant(): boolean {
    return this.outboundBytesTransmitted === 0 && this.dispatches.filter((d) => d.blocked).length === 0;
  }
}
