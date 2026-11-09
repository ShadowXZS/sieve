/**
 * File Ingestion & Drag-Drop Hook Adapter
 * Delegates to centralized useFileIngestion hook with worker progress updates.
 * Line ceiling: <= 250 lines.
 */

export * from '../../hooks/useFileIngestion.ts';
export { useFileIngestion } from '../../hooks/useFileIngestion.ts';
