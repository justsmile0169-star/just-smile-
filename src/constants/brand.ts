export const DEFAULT_LOGO_URL = '/logo.png';

export function getLogoUrl(logoUrl?: string): string {
  return logoUrl?.trim() || DEFAULT_LOGO_URL;
}
