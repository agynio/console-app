import type { EgressRule } from '@/gen/agynio/api/egress/v1/egress_pb';
import { EgressRuleAction, HeaderAuthScheme } from '@/gen/agynio/api/egress/v1/egress_pb';

export type EgressActionValue = 'allow' | 'deny';
export type HeaderCredentialSource = 'value' | 'secretId';
export type HeaderSchemeSelection = 'none' | 'bearer' | 'basic';

export type HeaderFormValues = {
  name: string;
  scheme: HeaderSchemeSelection;
  source: HeaderCredentialSource;
  value: string;
};

export type EgressRuleFormValues = {
  name: string;
  description: string;
  domainPattern: string;
  ports: string;
  methods: string;
  pathPattern: string;
  action: EgressActionValue;
  headers: HeaderFormValues[];
};

export type EgressRuleFormErrors = Partial<Record<keyof EgressRuleFormValues, string>> & {
  headers?: string;
};

export type SubmitEgressRuleValues = Omit<EgressRuleFormValues, 'ports' | 'methods'> & {
  ports: number[];
  methods: string[];
};

export const EMPTY_HEADER: HeaderFormValues = {
  name: '',
  scheme: 'none',
  source: 'value',
  value: '',
};

export const DEFAULT_EGRESS_RULE_FORM_VALUES: EgressRuleFormValues = {
  name: '',
  description: '',
  domainPattern: '',
  ports: '',
  methods: '',
  pathPattern: '',
  action: 'allow',
  headers: [],
};

export const actionFromProto = (action: EgressRuleAction | undefined): EgressActionValue =>
  action === EgressRuleAction.DENY ? 'deny' : 'allow';

export const actionToProto = (action: EgressActionValue): EgressRuleAction =>
  action === 'deny' ? EgressRuleAction.DENY : EgressRuleAction.ALLOW;

export const actionLabel = (action: EgressRuleAction | undefined) =>
  action === EgressRuleAction.DENY ? 'Deny' : 'Allow';

export const schemeFromProto = (scheme: HeaderAuthScheme): HeaderSchemeSelection => {
  switch (scheme) {
    case HeaderAuthScheme.BEARER:
      return 'bearer';
    case HeaderAuthScheme.BASIC:
      return 'basic';
    case HeaderAuthScheme.UNSPECIFIED:
      return 'none';
    default:
      throw new Error(`Unsupported header scheme: ${scheme}`);
  }
};

export const schemeToProto = (scheme: HeaderSchemeSelection): HeaderAuthScheme => {
  switch (scheme) {
    case 'bearer':
      return HeaderAuthScheme.BEARER;
    case 'basic':
      return HeaderAuthScheme.BASIC;
    case 'none':
      return HeaderAuthScheme.UNSPECIFIED;
  }
};

export const formatPorts = (ports: number[]) => (ports.length > 0 ? ports.join(', ') : 'Default');
export const formatMethods = (methods: string[]) => (methods.length > 0 ? methods.join(', ') : 'Any');

export const buildFormValuesFromRule = (rule: EgressRule | null): EgressRuleFormValues => {
  if (!rule) return { ...DEFAULT_EGRESS_RULE_FORM_VALUES };
  return {
    name: rule.name,
    description: rule.description,
    domainPattern: rule.matcher?.domainPattern ?? '',
    ports: rule.matcher?.ports.join(', ') ?? '',
    methods: rule.matcher?.methods.join(', ') ?? '',
    pathPattern: rule.matcher?.pathPattern ?? '',
    action: actionFromProto(rule.effect?.action),
    headers: (rule.effect?.inject ?? []).map((header) => ({
      name: header.name,
      scheme: schemeFromProto(header.scheme),
      source: header.credential.case === 'secretId' ? 'secretId' : 'value',
      value: header.credential.case === undefined ? '' : header.credential.value,
    })),
  };
};

export const normalizeRuleFormValues = (values: EgressRuleFormValues): EgressRuleFormValues => ({
  ...values,
  name: values.name.trim(),
  description: values.description.trim(),
  domainPattern: values.domainPattern.trim(),
  ports: values.ports.trim(),
  methods: values.methods.trim(),
  pathPattern: values.pathPattern.trim(),
  headers: values.headers.map((header) => ({
    ...header,
    name: header.name.trim(),
    value: header.value.trim(),
  })),
});

export const parsePorts = (ports: string): number[] => {
  if (!ports) return [];
  return ports.split(',').map((port) => {
    const trimmed = port.trim();
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error('Ports must be comma-separated integers between 1 and 65535.');
    }
    return parsed;
  });
};

export const parseMethods = (methods: string): string[] => {
  if (!methods) return [];
  return methods.split(',').map((method) => {
    const normalized = method.trim().toUpperCase();
    if (!normalized) throw new Error('Methods cannot contain empty values.');
    return normalized;
  });
};

export const validateRuleForm = (
  values: EgressRuleFormValues,
): { errors: EgressRuleFormErrors; parsed?: SubmitEgressRuleValues } => {
  const errors: EgressRuleFormErrors = {};
  if (!values.name) errors.name = 'Name is required.';
  if (!values.domainPattern) errors.domainPattern = 'Domain pattern is required.';

  let ports: number[] = [];
  let methods: string[] = [];
  try {
    ports = parsePorts(values.ports);
  } catch (error) {
    errors.ports = error instanceof Error ? error.message : 'Invalid ports.';
  }
  try {
    methods = parseMethods(values.methods);
  } catch (error) {
    errors.methods = error instanceof Error ? error.message : 'Invalid methods.';
  }

  for (const header of values.headers) {
    if (!header.name || !header.value) {
      errors.headers = 'Each header requires a name and value or secret ID.';
      break;
    }
  }

  if (Object.values(errors).some(Boolean)) return { errors };
  return {
    errors,
    parsed: {
      ...values,
      ports,
      methods,
    },
  };
};
