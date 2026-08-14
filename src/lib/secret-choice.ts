import { secretsClient } from '@/api/client';

// Both are offered in the same Select as the existing secrets, so neither
// choice means leaving the form and losing what is already typed into it.
export const NEW_SECRET = '__new__';
export const NO_SECRET = '__none__';

export type SecretChoice = {
  /** A secret id, NEW_SECRET, or NO_SECRET. */
  selection: string;
  /** Title for the secret to create. Only read when selection is NEW_SECRET. */
  title: string;
  /** Value for the secret to create. Only read when selection is NEW_SECRET. */
  value: string;
};

export function secretChoiceOf(secretId: string): SecretChoice {
  return { selection: secretId || NO_SECRET, title: '', value: '' };
}

/**
 * resolveSecretChoice settles a choice into the id a resource stores. A new
 * secret is created first and referenced by id, so the resource holds a
 * reference either way and the value never reaches the service that owns it.
 *
 * Returns an empty string when nothing is referenced.
 */
export async function resolveSecretChoice(input: {
  organizationId: string;
  choice: SecretChoice;
  fallbackTitle: string;
  description: string;
}): Promise<string> {
  const { organizationId, choice, fallbackTitle, description } = input;
  if (choice.selection === NO_SECRET || choice.selection === '') return '';
  if (choice.selection !== NEW_SECRET) return choice.selection;

  const created = await secretsClient.createSecret({
    organizationId,
    title: choice.title.trim() || fallbackTitle,
    description,
    value: choice.value,
  });
  return created.secret?.meta?.id ?? '';
}
