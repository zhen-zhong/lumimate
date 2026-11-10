export const PUBLIC_SITE_URL = 'https://liyang.live/lumimate';

export const PUBLIC_PAGES = {
  privacyPolicy: `${PUBLIC_SITE_URL}/privacy-policy`,
  privacyChoices: `${PUBLIC_SITE_URL}/privacy-choices`,
  support: `${PUBLIC_SITE_URL}/support`,
} as const;

export type LegalDocument = 'privacy-policy' | 'privacy-choices';

export function legalDocumentDetails(document: string | undefined) {
  if (document === 'privacy-choices') {
    return { title: '用户隐私选择', url: PUBLIC_PAGES.privacyChoices };
  }
  return { title: '隐私政策', url: PUBLIC_PAGES.privacyPolicy };
}
