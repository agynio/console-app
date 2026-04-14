const NICKNAME_PATTERN = /^[a-z0-9_-]+$/;

export const NICKNAME_MAX_LENGTH = 32;

export function getNicknameValidationError(value: string): string {
  if (!value) return '';
  if (value.length > NICKNAME_MAX_LENGTH) {
    return 'Nickname must be 32 characters or fewer.';
  }
  if (!NICKNAME_PATTERN.test(value)) {
    return 'Nickname can only include lowercase letters, numbers, underscores, and hyphens.';
  }
  return '';
}
