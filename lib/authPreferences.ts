export const SAVED_EMAIL_KEY = 'bebimom.savedLoginEmail';
export const AUTO_LOGIN_KEY = 'bebimom.autoLogin';

export function isAutoLoginEnabled(value: string | null): boolean {
  return value !== 'false';
}
