import type { JsonObject, JsonValue } from '@bufbuild/protobuf';

/**
 * The honored subset of JSON Schema an app reports for its installation
 * configuration. The Apps Service rejects anything outside it at report time,
 * so this reader can be a plain walk rather than a validator: a schema that
 * reaches the browser has already been checked.
 */
export type PropertyType = 'string' | 'integer' | 'number' | 'boolean' | 'array';

export type RefKind = 'agent' | 'environment' | 'model';

export type SchemaProperty = {
  name: string;
  type: PropertyType;
  title: string;
  description?: string;
  default?: JsonValue;
  deprecated: boolean;
  required: boolean;
  enum?: JsonValue[];
  pattern?: string;
  format?: 'uri' | 'email' | 'uuid';
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  secret: boolean;
  ref?: RefKind;
};

export type ConfigurationSchema = {
  properties: SchemaProperty[];
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const REF_KINDS: RefKind[] = ['agent', 'environment', 'model'];

/**
 * Reads a reported schema. Returns undefined when the app has reported none,
 * which is the signal to fall back to the JSON editor — the only honest option
 * when nothing describes what belongs in the configuration.
 */
export function readConfigurationSchema(document: JsonObject | undefined): ConfigurationSchema | undefined {
  const root = asRecord(document);
  if (!root) return undefined;

  const rawProperties = asRecord(root.properties);
  if (!rawProperties) return { properties: [] };

  const required = new Set(
    Array.isArray(root.required) ? root.required.filter((name): name is string => typeof name === 'string') : [],
  );

  const properties = Object.entries(rawProperties).flatMap(([name, raw]): SchemaProperty[] => {
    const property = asRecord(raw);
    const type = property?.type;
    if (!property || typeof type !== 'string') return [];
    if (!['string', 'integer', 'number', 'boolean', 'array'].includes(type)) return [];

    const ref = typeof property['x-agyn-ref'] === 'string' ? (property['x-agyn-ref'] as RefKind) : undefined;
    const format = property.format;

    return [
      {
        name,
        type: type as PropertyType,
        // The property name is the last-resort label: an app that reports no
        // title still gets a form, just a plainer one.
        title: typeof property.title === 'string' && property.title !== '' ? property.title : name,
        description: typeof property.description === 'string' ? property.description : undefined,
        default: property.default as JsonValue | undefined,
        deprecated: property.deprecated === true,
        required: required.has(name),
        enum: Array.isArray(property.enum) ? (property.enum as JsonValue[]) : undefined,
        pattern: typeof property.pattern === 'string' ? property.pattern : undefined,
        format:
          format === 'uri' || format === 'email' || format === 'uuid' ? (format as SchemaProperty['format']) : undefined,
        minLength: asNumber(property.minLength),
        maxLength: asNumber(property.maxLength),
        minimum: asNumber(property.minimum),
        maximum: asNumber(property.maximum),
        minItems: asNumber(property.minItems),
        maxItems: asNumber(property.maxItems),
        secret: property['x-agyn-secret'] === true,
        ref: ref && REF_KINDS.includes(ref) ? ref : undefined,
      },
    ];
  });

  return { properties };
}

/**
 * Which properties the form shows. A deprecated property is hidden until the
 * installation actually carries a value for it — then it appears so an admin
 * can clear it, which is what eventually lets the app drop it.
 */
export function visibleProperties(schema: ConfigurationSchema, values: JsonObject, secretKeysSet: string[]): SchemaProperty[] {
  const set = new Set(secretKeysSet);
  return schema.properties.filter(
    (property) => !property.deprecated || property.name in values || set.has(property.name),
  );
}

/** Prefills a form for a new installation from the schema's declared defaults. */
export function initialValues(schema: ConfigurationSchema): JsonObject {
  const values: JsonObject = {};
  for (const property of schema.properties) {
    if (property.deprecated) continue;
    if (property.default !== undefined) values[property.name] = property.default;
  }
  return values;
}

/**
 * Checks a value against the constraints the schema states, so an obvious
 * mistake is caught in the form. The server checks the same things again —
 * this is a courtesy, not the boundary.
 */
export function validateProperty(property: SchemaProperty, value: JsonValue | undefined): string | undefined {
  const missing =
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0 && property.required);
  if (missing) return property.required ? 'Required' : undefined;

  if (property.type === 'string' && typeof value === 'string') {
    if (property.minLength !== undefined && value.length < property.minLength) {
      return `Must be at least ${property.minLength} characters`;
    }
    if (property.maxLength !== undefined && value.length > property.maxLength) {
      return `Must be at most ${property.maxLength} characters`;
    }
    if (property.pattern !== undefined && !new RegExp(property.pattern).test(value)) {
      return `Must match ${property.pattern}`;
    }
    if (property.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return 'Must be a UUID';
    }
    if (property.format === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      return 'Must be an email address';
    }
    if (property.format === 'uri' && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      return 'Must be an absolute URI';
    }
  }

  if ((property.type === 'integer' || property.type === 'number') && typeof value === 'number') {
    if (property.type === 'integer' && !Number.isInteger(value)) return 'Must be a whole number';
    if (property.minimum !== undefined && value < property.minimum) return `Must be at least ${property.minimum}`;
    if (property.maximum !== undefined && value > property.maximum) return `Must be at most ${property.maximum}`;
  }

  if (property.type === 'array' && Array.isArray(value)) {
    if (property.minItems !== undefined && value.length < property.minItems) {
      return `Must have at least ${property.minItems} items`;
    }
    if (property.maxItems !== undefined && value.length > property.maxItems) {
      return `Must have at most ${property.maxItems} items`;
    }
  }

  return undefined;
}

export function validateConfiguration(
  schema: ConfigurationSchema,
  values: JsonObject,
  secretKeysSet: string[],
): Record<string, string> {
  const alreadySet = new Set(secretKeysSet);
  const errors: Record<string, string> = {};
  for (const property of schema.properties) {
    // A secret the installation already holds needs no value in the form:
    // leaving it untouched keeps what is stored.
    if (property.secret && alreadySet.has(property.name) && values[property.name] === undefined) continue;
    const message = validateProperty(property, values[property.name]);
    if (message) errors[property.name] = message;
  }
  return errors;
}

/**
 * Strips the entries a write should not carry: a secret left untouched is
 * omitted so the server keeps the stored value, and an empty optional is
 * omitted rather than sent as an empty string.
 */
export function toSubmittedConfiguration(schema: ConfigurationSchema, values: JsonObject): JsonObject {
  const submitted: JsonObject = {};
  for (const property of schema.properties) {
    const value = values[property.name];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value === '' && !property.required) continue;
    submitted[property.name] = value;
  }
  return submitted;
}
