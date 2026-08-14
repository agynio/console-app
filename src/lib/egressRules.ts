import type { EgressRule, EgressRuleUpstreamTls } from '@/gen/agynio/api/egress/v1/egress_pb';
import { EgressRuleAction, HeaderAuthScheme } from '@/gen/agynio/api/egress/v1/egress_pb';

export type EgressActionValue = 'allow' | 'deny';
export type DestinationKind = 'public' | 'private';
export type UpstreamTrustSelection = 'default' | 'caBundle' | 'skipVerify';
export type HeaderCredentialSource = 'value' | 'secretId';
export type HeaderSchemeSelection = 'none' | 'bearer' | 'basic';

export type HeaderFormValues = {
  name: string;
  scheme: HeaderSchemeSelection;
  source: HeaderCredentialSource;
  value: string;
  requiresValueReentry?: boolean;
};

export type EgressRuleFormValues = {
  name: string;
  description: string;
  destinationKind: DestinationKind;
  domainPattern: string;
  privateResourceId: string;
  upstreamServerName: string;
  upstreamTrust: UpstreamTrustSelection;
  upstreamCaSecretId: string;
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
  destinationKind: 'public',
  domainPattern: '',
  privateResourceId: '',
  upstreamServerName: '',
  upstreamTrust: 'default',
  upstreamCaSecretId: '',
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

export const isPrivateRule = (rule: EgressRule): boolean => Boolean(rule.matcher?.privateResourceId);

const upstreamTrustFromProto = (upstreamTls: EgressRuleUpstreamTls | undefined): UpstreamTrustSelection => {
  if (upstreamTls?.trust.case === 'caBundleSecretId') return 'caBundle';
  if (upstreamTls?.trust.case === 'insecureSkipVerify' && upstreamTls.trust.value) return 'skipVerify';
  return 'default';
};

export const buildFormValuesFromRule = (rule: EgressRule | null): EgressRuleFormValues => {
  if (!rule) return { ...DEFAULT_EGRESS_RULE_FORM_VALUES };
  return {
    name: rule.name,
    description: rule.description,
    destinationKind: isPrivateRule(rule) ? 'private' : 'public',
    domainPattern: rule.matcher?.domainPattern ?? '',
    privateResourceId: rule.matcher?.privateResourceId ?? '',
    upstreamServerName: rule.upstreamTls?.serverName ?? '',
    upstreamTrust: upstreamTrustFromProto(rule.upstreamTls),
    upstreamCaSecretId: rule.upstreamTls?.trust.case === 'caBundleSecretId' ? rule.upstreamTls.trust.value : '',
    ports: rule.matcher?.ports.join(', ') ?? '',
    methods: rule.matcher?.methods.join(', ') ?? '',
    pathPattern: rule.matcher?.pathPattern ?? '',
    action: actionFromProto(rule.effect?.action),
    headers: (rule.effect?.inject ?? []).map((header) => ({
      name: header.name,
      scheme: schemeFromProto(header.scheme),
      source: header.credential.case === 'secretId' ? 'secretId' : 'value',
      value: header.credential.case === undefined ? '' : header.credential.value,
      requiresValueReentry: header.credential.case === undefined,
    })),
  };
};

export const normalizeRuleFormValues = (values: EgressRuleFormValues): EgressRuleFormValues => ({
  ...values,
  name: values.name.trim(),
  description: values.description.trim(),
  domainPattern: values.destinationKind === 'public' ? values.domainPattern.trim() : '',
  privateResourceId: values.destinationKind === 'private' ? values.privateResourceId.trim() : '',
  upstreamServerName: values.destinationKind === 'private' ? values.upstreamServerName.trim() : '',
  upstreamCaSecretId: values.destinationKind === 'private' && values.upstreamTrust === 'caBundle' ? values.upstreamCaSecretId.trim() : '',
  // A private destination covers every intercept port the resource declares.
  ports: values.destinationKind === 'public' ? values.ports.trim() : '',
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
  const parsedPorts = ports.split(',').map((port) => {
    const trimmed = port.trim();
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error('Ports must be comma-separated integers between 1 and 65535.');
    }
    return parsed;
  });
  return Array.from(new Set(parsedPorts)).sort((left, right) => left - right);
};

export const parseMethods = (methods: string): string[] => {
  if (!methods) return [];
  const parsedMethods = methods.split(',').map((method) => {
    const normalized = method.trim().toUpperCase();
    if (!normalized) throw new Error('Methods cannot contain empty values.');
    return normalized;
  });
  return Array.from(new Set(parsedMethods)).sort((left, right) => left.localeCompare(right));
};

export const validateRuleForm = (
  values: EgressRuleFormValues,
): { errors: EgressRuleFormErrors; parsed?: SubmitEgressRuleValues } => {
  const errors: EgressRuleFormErrors = {};
  if (!values.name) errors.name = 'Name is required.';
  if (values.destinationKind === 'public' && !values.domainPattern) errors.domainPattern = 'Domain pattern is required.';
  if (values.destinationKind === 'private' && !values.privateResourceId) errors.privateResourceId = 'Select a private resource.';
  if (values.destinationKind === 'private' && values.upstreamTrust === 'caBundle' && !values.upstreamCaSecretId) {
    errors.upstreamCaSecretId = 'Select the CA bundle secret.';
  }

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
      errors.headers = header.requiresValueReentry
        ? 'Literal header values are not displayed; enter a new value or remove the header.'
        : 'Each header requires a name and literal value or selected secret.';
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

export type UpstreamTlsInit = {
  serverName: string;
  trust:
    | { case: 'caBundleSecretId'; value: string }
    | { case: 'insecureSkipVerify'; value: boolean }
    | { case: undefined };
};

// All fields empty clears the block on update; public destinations carry none.
export const upstreamTlsToProto = (values: SubmitEgressRuleValues): UpstreamTlsInit | undefined => {
  if (values.destinationKind !== 'private') return undefined;
  if (values.upstreamTrust === 'caBundle') {
    return { serverName: values.upstreamServerName, trust: { case: 'caBundleSecretId', value: values.upstreamCaSecretId } };
  }
  if (values.upstreamTrust === 'skipVerify') {
    return { serverName: values.upstreamServerName, trust: { case: 'insecureSkipVerify', value: true } };
  }
  return { serverName: values.upstreamServerName, trust: { case: undefined } };
};
