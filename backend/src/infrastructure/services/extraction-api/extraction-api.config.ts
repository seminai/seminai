const DEFAULT_TRIAL_PAGES = 10;
const DEFAULT_MARGIN = 0.3;

export function getExtractionApiTrialPages(): number {
  const raw = process.env.EXTRACTION_API_TRIAL_PAGES;
  if (!raw) {
    return DEFAULT_TRIAL_PAGES;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TRIAL_PAGES;
}

export function getExtractionApiInviteCode(): string | null {
  const code = process.env.EXTRACTION_API_INVITE_CODE?.trim();
  return code && code.length > 0 ? code : null;
}

export function getExtractionApiMargin(): number {
  const raw = process.env.EXTRACTION_API_MARGIN;
  if (!raw) {
    return DEFAULT_MARGIN;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MARGIN;
}
