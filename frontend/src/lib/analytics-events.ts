/**
 * Typed PostHog event taxonomy for the frontend.
 *
 * Source of truth: `docs/analytics/TAXONOMY.md`. Any new FE event MUST be
 * added here AND to the taxonomy doc. Backend-owned events (e.g. `jobs_created`,
 * `diagnosis_produced`, `$ai_generation`) are intentionally NOT listed here —
 * they are emitted server-side to avoid double counting.
 *
 * Naming convention: `snake_case`, `object_action`.
 */
export type AnalyticsEvent =
  | 'chat_message_sent'
  | 'chat_stream_aborted'
  | 'chat_stream_retried'
  | 'approval_submitted'
  | 'rejection_submitted'
  | 'company_form_submitted'
  | 'production_unit_wizard_completed'
  | 'field_wizard_completed'
  | 'file_upload_started'
  | 'export_requested'
  | 'workspace_created'
  | 'workspace_switched';

/**
 * Allowed event property values. Restricted to scalars so callers cannot
 * accidentally ship nested objects or PII-bearing payloads as properties.
 */
export type AnalyticsPropValue = string | number | boolean | null;

export type AnalyticsProps = Readonly<Record<string, AnalyticsPropValue>>;
