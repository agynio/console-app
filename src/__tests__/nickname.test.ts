import { describe, expect, it } from 'vitest';
import { NICKNAME_MAX_LENGTH, getNicknameValidationError } from '@/lib/nickname';

describe('nickname validation', () => {
  it('accepts empty values', () => {
    expect(getNicknameValidationError('')).toBe('');
  });

  it('accepts valid nicknames', () => {
    const validValues = ['my-agent', 'a', 'a_b-c123'];

    validValues.forEach((value) => {
      expect(getNicknameValidationError(value)).toBe('');
    });
  });

  it('accepts exactly max length', () => {
    const value = 'a'.repeat(NICKNAME_MAX_LENGTH);

    expect(getNicknameValidationError(value)).toBe('');
  });

  it('rejects nicknames that are too long', () => {
    const value = 'a'.repeat(NICKNAME_MAX_LENGTH + 1);

    expect(getNicknameValidationError(value)).toBe('Nickname must be 32 characters or fewer.');
  });

  it('rejects nicknames with invalid characters', () => {
    const invalidValues = ['My-Agent', 'bad nickname', '@agent', 'agent.name', 'agent!'];

    invalidValues.forEach((value) => {
      expect(getNicknameValidationError(value)).toBe(
        'Nickname can only include lowercase letters, numbers, underscores, and hyphens.',
      );
    });
  });
});
