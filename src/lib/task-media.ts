/** Shared rules for files uploaded as a task/project Document (see supabase/migrations/add_task_document_uploads.sql). Pure — safe in client and server code. */

export const TASK_DOCUMENT_BUCKET = "task-documents";
export const TASK_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
