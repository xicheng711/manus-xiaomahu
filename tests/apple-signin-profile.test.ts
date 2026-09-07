import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  APPLE_ACCOUNT_FALLBACK_NAME,
  chooseOnboardingAccountName,
  formatAppleFullName,
  normalizeProviderText,
  resolveProviderText,
} from '../shared/apple-auth';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Sign in with Apple account data', () => {
  it('formats the name supplied by Authentication Services for Chinese and Latin names', () => {
    expect(formatAppleFullName({ familyName: '王', givenName: '小明' })).toBe('王小明');
    expect(formatAppleFullName({ familyName: 'Appleseed', givenName: 'John' })).toBe('John Appleseed');
    expect(formatAppleFullName({ nickname: 'Alex' })).toBe('Alex');
  });

  it('normalizes provider text before it is stored', () => {
    expect(normalizeProviderText('  John   Appleseed  ')).toBe('John Appleseed');
    expect(normalizeProviderText('   ')).toBeNull();
    expect(normalizeProviderText(null)).toBeNull();
  });

  it('keeps the first authorization name when a later Apple credential omits it', () => {
    expect(resolveProviderText(null, '王小明', APPLE_ACCOUNT_FALLBACK_NAME)).toBe('王小明');
    expect(resolveProviderText('李小红', '王小明', APPLE_ACCOUNT_FALLBACK_NAME)).toBe('李小红');
    expect(resolveProviderText(null, null, APPLE_ACCOUNT_FALLBACK_NAME)).toBe('Apple 用户');
  });

  it('uses Apple name for new users but preserves an existing user’s later profile edit', () => {
    expect(chooseOnboardingAccountName({
      authName: '王小明', savedName: null, isAppleAccount: true,
    })).toBe('王小明');
    expect(chooseOnboardingAccountName({
      authName: '王小明', savedName: '小明姐姐', isAppleAccount: true, preferSavedName: true,
    })).toBe('小明姐姐');
    expect(chooseOnboardingAccountName({
      authName: null, savedName: null, isAppleAccount: true,
    })).toBe('Apple 用户');
  });
});

describe('Sign in with Apple onboarding review safeguards', () => {
  const clientAuth = read('lib/auth-providers.ts');
  const serverAuth = read('server/auth-providers.ts');
  const onboarding = read('app/onboarding.tsx');
  const profile = read('app/profile.tsx');

  it('requests and sends the Authentication Services full name', () => {
    expect(clientAuth).toContain('AppleAuth.AppleAuthenticationScope.FULL_NAME');
    expect(clientAuth).toContain('fullName: credential.fullName');
    expect(serverAuth).toContain('const appleName = formatAppleFullName(fullName)');
  });

  it('returns the persisted effective name instead of clearing it on later login', () => {
    expect(serverAuth).toContain("const existingUser = await getUserByOpenId(openId)");
    expect(serverAuth).toContain('const effectiveName = resolveProviderText(name, existingUser?.name, fallbackName)');
    expect(serverAuth).toContain('...(normalizeProviderText(name) ? { name: effectiveName } : {})');
    expect(serverAuth).toContain('name: responseName');
  });

  it('keeps registered users out of onboarding and preserves voluntary profile-name editing', () => {
    expect(clientAuth).toContain('if (Array.isArray(serverRooms) && serverRooms.length > 0)');
    expect(clientAuth).toContain("router.replace('/(tabs)' as any)");
    expect(profile).toContain('caregiverName: draftCaregiverName.trim() || userProfile?.caregiverName ||');
    expect(profile).toContain('cloudUpdateMemberProfile({');
    expect(profile).toContain('name: updatedUp.caregiverName');
  });

  it('automatically adopts the Apple account name and does not require another name entry', () => {
    expect(onboarding).toContain('Promise.all([getUserInfo(), getUserProfile()])');
    expect(onboarding).toContain("const appleAccount = authUser?.loginMethod === 'apple'");
    expect(onboarding).toContain('const preferredName = chooseOnboardingAccountName({');
    expect(onboarding).toContain('preferSavedName: fromProfile');
    expect(onboarding).toContain('setCaregiverName(current => current.trim() || preferredName)');
    expect(onboarding).toContain('setJoinerName(current => current.trim() || preferredName)');
    expect(onboarding).toContain("if (step === 3) return isAppleAccount || caregiverName.trim().length > 0");
    expect(onboarding).toContain("if (step === 4) return isAppleAccount || joinerName.trim().length > 0");
    expect(onboarding).toContain("isAppleAccount ? '设置您的头像' : '您的信息'");
    expect(onboarding).toContain('姓名已从登录信息中自动填写，无需重复输入');
    expect(onboarding).toContain('稍后可在个人资料中修改');
  });
});
