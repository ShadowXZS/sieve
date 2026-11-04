/**
 * Sieve File System Access Sync Service (Phase 8)
 *
 * Implements client-side encrypted backup mirroring to local disk using
 * the native browser File System Access API (showDirectoryPicker / showSaveFilePicker).
 * Guarantees zero intermediary cloud uploads and enforces .sievevault extensions.
 */

export interface MockWritableStream {
  write(chunk: any): Promise<void>;
  close(): Promise<void>;
}

export interface MockFileHandle {
  createWritable(): Promise<MockWritableStream>;
}

export interface MockDirectoryHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileHandle>;
}

export interface FileSyncResult {
  success: boolean;
  filename: string;
  bytesWritten: number;
  timestamp: number;
}

/**
 * Normalizes vault filename ensuring .sievevault extension.
 */
export function normalizeVaultFilename(filename: string): string {
  const trimmed = filename.trim();
  if (trimmed.toLowerCase().endsWith('.sievevault')) {
    return trimmed;
  }
  return `${trimmed}.sievevault`;
}

/**
 * Mirrors an encrypted vault payload to a selected local directory handle.
 */
export async function syncVaultToLocalDirectory(
  directoryHandle: FileSystemDirectoryHandle | MockDirectoryHandle,
  filename: string,
  payload: Uint8Array
): Promise<FileSyncResult> {
  const normalizedName = normalizeVaultFilename(filename);

  const fileHandle = await directoryHandle.getFileHandle(normalizedName, { create: true });
  const writable = await fileHandle.createWritable();

  try {
    await writable.write(payload);
  } finally {
    await writable.close();
  }

  return {
    success: true,
    filename: normalizedName,
    bytesWritten: payload.byteLength,
    timestamp: Date.now(),
  };
}

/**
 * Client-side directory picker wrapper.
 */
export async function pickLocalDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      return await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
  }
  return null;
}

/**
 * Fallback browser file download trigger for environments where File System Access API is restricted.
 */
export function triggerBrowserVaultDownload(payload: Uint8Array, filename: string): void {
  const normalizedName = normalizeVaultFilename(filename);
  const blob = new Blob([payload as any], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = normalizedName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

