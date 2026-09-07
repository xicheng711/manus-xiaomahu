export type AppleFullName = {
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
  nickname?: string | null;
  namePrefix?: string | null;
  nameSuffix?: string | null;
} | null | undefined;

export const APPLE_ACCOUNT_FALLBACK_NAME = 'Apple 用户';

export function chooseOnboardingAccountName({
  authName,
  savedName,
  isAppleAccount,
  preferSavedName = false,
}: {
  authName: unknown;
  savedName: unknown;
  isAppleAccount: boolean;
  preferSavedName?: boolean;
}): string {
  const normalizedAuthName = normalizeProviderText(authName);
  const normalizedSavedName = normalizeProviderText(savedName);
  const preferred = preferSavedName
    ? normalizedSavedName ?? normalizedAuthName
    : normalizedAuthName ?? normalizedSavedName;

  return preferred ?? (isAppleAccount ? APPLE_ACCOUNT_FALLBACK_NAME : '');
}

export function normalizeProviderText(value: unknown, maxLength = 100): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

/**
 * Authentication Services returns PersonNameComponents instead of a formatted
 * display name. Preserve the familiar family-name-first order for CJK names
 * and use given-name-first order with spaces for other scripts.
 */
export function formatAppleFullName(fullName: AppleFullName): string | null {
  if (!fullName) return null;

  const givenName = normalizeProviderText(fullName.givenName);
  const middleName = normalizeProviderText(fullName.middleName);
  const familyName = normalizeProviderText(fullName.familyName);
  const nickname = normalizeProviderText(fullName.nickname);
  const combined = [familyName, middleName, givenName].filter(Boolean).join('');
  const containsCjk = /[\u3400-\u9fff\uf900-\ufaff]/u.test(combined);

  if (containsCjk) {
    return [familyName, middleName, givenName].filter(Boolean).join('') || nickname;
  }

  return [givenName, middleName, familyName].filter(Boolean).join(' ') || nickname;
}

/**
 * Apple may only return contact fields during the initial authorization. Keep
 * the server-side value when a later credential omits them.
 */
export function resolveProviderText(
  incomingValue: unknown,
  existingValue: unknown,
  fallback: string | null = null,
  maxLength = 100,
): string | null {
  return (
    normalizeProviderText(incomingValue, maxLength) ??
    normalizeProviderText(existingValue, maxLength) ??
    normalizeProviderText(fallback, maxLength)
  );
}
