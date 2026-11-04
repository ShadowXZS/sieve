/**
 * Multi-Platform Negative Keyword Export Modal (Phase 5)
 *
 * Re-exports ExportDefModal which renders via React Portal to document.body,
 * preventing clipping within virtualized grid containers with overflow: hidden.
 */

export * from './ExportDefModal.tsx';
export { ExportDefModal as ExportModal } from './ExportDefModal.tsx';
export type { ExportDefModalProps as ExportModalProps } from './ExportDefModal.tsx';
