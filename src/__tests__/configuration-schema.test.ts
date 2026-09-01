import { describe, expect, it } from 'vitest';
import type { JsonObject } from '@bufbuild/protobuf';
import {
  initialValues,
  readConfigurationSchema,
  toSubmittedConfiguration,
  validateConfiguration,
  visibleProperties,
} from '@/lib/configurationSchema';

const telegram = {
  type: 'object',
  properties: {
    bot_token: { type: 'string', title: 'Bot token', 'x-agyn-secret': true },
    agent_id: { type: 'string', format: 'uuid', 'x-agyn-ref': 'agent' },
    retries: { type: 'integer', minimum: 0, maximum: 5, default: 3 },
    old_field: { type: 'string', deprecated: true },
  },
  required: ['bot_token', 'agent_id'],
} as unknown as JsonObject;

const schema = () => {
  const parsed = readConfigurationSchema(telegram);
  if (!parsed) throw new Error('schema did not parse');
  return parsed;
};

describe('readConfigurationSchema', () => {
  it('returns undefined when the app has reported no schema', () => {
    expect(readConfigurationSchema(undefined)).toBeUndefined();
  });

  it('reads the agyn keywords', () => {
    const parsed = schema();
    const byName = Object.fromEntries(parsed.properties.map((property) => [property.name, property]));
    expect(byName.bot_token.secret).toBe(true);
    expect(byName.bot_token.required).toBe(true);
    expect(byName.agent_id.ref).toBe('agent');
    expect(byName.old_field.deprecated).toBe(true);
    expect(byName.retries.maximum).toBe(5);
  });

  it('falls back to the property name when no title is reported', () => {
    const parsed = schema();
    expect(parsed.properties.find((property) => property.name === 'agent_id')?.title).toBe('agent_id');
  });
});

describe('visibleProperties', () => {
  it('hides a deprecated property the installation does not carry', () => {
    const shown = visibleProperties(schema(), {}, []).map((property) => property.name);
    expect(shown).not.toContain('old_field');
  });

  it('shows a deprecated property that still holds a value, so it can be cleared', () => {
    const shown = visibleProperties(schema(), { old_field: 'legacy' }, []).map((property) => property.name);
    expect(shown).toContain('old_field');
  });
});

describe('initialValues', () => {
  it('prefills declared defaults', () => {
    expect(initialValues(schema())).toEqual({ retries: 3 });
  });
});

describe('validateConfiguration', () => {
  it('reports each property that fails', () => {
    const errors = validateConfiguration(schema(), { retries: 9 }, []);
    expect(Object.keys(errors).sort()).toEqual(['agent_id', 'bot_token', 'retries']);
  });

  it('does not require a secret the installation already holds', () => {
    const errors = validateConfiguration(
      schema(),
      { agent_id: '8f14e45f-ceea-467a-9575-6f2f0f1f0f0f' },
      ['bot_token'],
    );
    expect(errors).toEqual({});
  });

  it('checks the declared format', () => {
    const errors = validateConfiguration(schema(), { bot_token: 'x', agent_id: 'not-a-uuid' }, []);
    expect(errors.agent_id).toBe('Must be a UUID');
  });
});

describe('toSubmittedConfiguration', () => {
  it('omits an untouched secret so the server keeps the stored value', () => {
    const submitted = toSubmittedConfiguration(schema(), {
      agent_id: '8f14e45f-ceea-467a-9575-6f2f0f1f0f0f',
      retries: 3,
    });
    expect(submitted).toEqual({ agent_id: '8f14e45f-ceea-467a-9575-6f2f0f1f0f0f', retries: 3 });
    expect('bot_token' in submitted).toBe(false);
  });

  it('sends a replaced secret', () => {
    const submitted = toSubmittedConfiguration(schema(), { bot_token: 'new', agent_id: 'x' });
    expect(submitted.bot_token).toBe('new');
  });
});
