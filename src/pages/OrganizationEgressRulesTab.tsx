import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { egressClient, secretsClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EgressRule, EgressRuleHeader } from '@/gen/agynio/api/egress/v1/egress_pb';
import type { Secret } from '@/gen/agynio/api/secrets/v1/secrets_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, timestampToMillis } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

import {
  actionLabel,
  actionToProto,
  buildFormValuesFromRule,
  DEFAULT_EGRESS_RULE_FORM_VALUES,
  EMPTY_HEADER,
  formatMethods,
  formatPorts,
  normalizeRuleFormValues,
  schemeToProto,
  validateRuleForm,
  type EgressActionValue,
  type EgressRuleFormErrors,
  type EgressRuleFormValues,
  type HeaderCredentialSource,
  type HeaderFormValues,
  type HeaderSchemeSelection,
  type SubmitEgressRuleValues,
} from '@/lib/egressRules';

type EgressRuleDialogProps = {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues: EgressRuleFormValues;
  onSubmit: (values: SubmitEgressRuleValues) => void;
  isSubmitting: boolean;
  secrets: Secret[];
};

function EgressRuleDialog({ mode, open, onOpenChange, initialValues, onSubmit, isSubmitting, secrets }: EgressRuleDialogProps) {
  const [values, setValues] = useState<EgressRuleFormValues>(initialValues);
  const [errors, setErrors] = useState<EgressRuleFormErrors>({});
  const [secretSearchByHeader, setSecretSearchByHeader] = useState<Record<number, string>>({});
  const resolvedInitialValues = useMemo(() => ({ ...DEFAULT_EGRESS_RULE_FORM_VALUES, ...initialValues }), [initialValues]);

  useEffect(() => {
    if (open) {
      setValues(resolvedInitialValues);
      setErrors({});
      setSecretSearchByHeader({});
      return;
    }
    setValues({ ...DEFAULT_EGRESS_RULE_FORM_VALUES });
    setErrors({});
    setSecretSearchByHeader({});
  }, [open, resolvedInitialValues]);

  const testIdPrefix = mode === 'create' ? 'egress-rules-create' : 'egress-rules-edit';
  const clearError = (field: keyof EgressRuleFormErrors) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const selectableSecrets = useMemo(() => secrets.filter((secret) => Boolean(secret.meta?.id)), [secrets]);

  const filteredSecretsByHeader = (index: number) => {
    const search = (secretSearchByHeader[index] ?? '').trim().toLowerCase();
    if (!search) return selectableSecrets;
    return selectableSecrets.filter((secret) => {
      const secretId = secret.meta?.id ?? '';
      return [secret.title, secret.remoteName, secretId].some((value) => value.toLowerCase().includes(search));
    });
  };

  const updateHeader = (index: number, nextHeader: Partial<HeaderFormValues>) => {
    setValues((prev) => ({
      ...prev,
      headers: prev.headers.map((header, currentIndex) =>
        currentIndex === index ? { ...header, ...nextHeader } : header,
      ),
    }));
    clearError('headers');
  };

  const handleSubmit = () => {
    const normalized = normalizeRuleFormValues(values);
    const validation = validateRuleForm(normalized);
    setErrors(validation.errors);
    if (!validation.parsed) return;
    onSubmit(validation.parsed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid={`${testIdPrefix}-dialog`}>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create egress rule' : 'Edit egress rule'}</DialogTitle>
          <DialogDescription>
            Define destination matching, allow/deny behavior, and injected headers.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-name`}>Name</Label>
            <Input
              id={`${testIdPrefix}-name`}
              value={values.name}
              onChange={(event) => {
                setValues((prev) => ({ ...prev, name: event.target.value }));
                clearError('name');
              }}
              data-testid={`${testIdPrefix}-name`}
            />
            {errors.name ? <p className="text-sm text-destructive">{errors.name}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-domain`}>Domain pattern</Label>
            <Input
              id={`${testIdPrefix}-domain`}
              placeholder="api.example.com"
              value={values.domainPattern}
              onChange={(event) => {
                setValues((prev) => ({ ...prev, domainPattern: event.target.value }));
                clearError('domainPattern');
              }}
              data-testid={`${testIdPrefix}-domain`}
            />
            {errors.domainPattern ? <p className="text-sm text-destructive">{errors.domainPattern}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-description`}>Description</Label>
            <Input
              id={`${testIdPrefix}-description`}
              value={values.description}
              onChange={(event) => setValues((prev) => ({ ...prev, description: event.target.value }))}
              data-testid={`${testIdPrefix}-description`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-action`}>Action</Label>
            <Select
              value={values.action}
              onValueChange={(action: EgressActionValue) => setValues((prev) => ({ ...prev, action }))}
            >
              <SelectTrigger id={`${testIdPrefix}-action`} data-testid={`${testIdPrefix}-action`}>
                <SelectValue placeholder="Select action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-ports`}>Ports</Label>
            <Input
              id={`${testIdPrefix}-ports`}
              placeholder="443, 8443"
              value={values.ports}
              onChange={(event) => {
                setValues((prev) => ({ ...prev, ports: event.target.value }));
                clearError('ports');
              }}
              data-testid={`${testIdPrefix}-ports`}
            />
            {errors.ports ? <p className="text-sm text-destructive">{errors.ports}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-methods`}>Methods</Label>
            <Input
              id={`${testIdPrefix}-methods`}
              placeholder="GET, POST"
              value={values.methods}
              onChange={(event) => {
                setValues((prev) => ({ ...prev, methods: event.target.value }));
                clearError('methods');
              }}
              data-testid={`${testIdPrefix}-methods`}
            />
            {errors.methods ? <p className="text-sm text-destructive">{errors.methods}</p> : null}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`${testIdPrefix}-path`}>Path pattern</Label>
            <Input
              id={`${testIdPrefix}-path`}
              placeholder="/v1/*"
              value={values.pathPattern}
              onChange={(event) => setValues((prev) => ({ ...prev, pathPattern: event.target.value }))}
              data-testid={`${testIdPrefix}-path`}
            />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Injected headers</h4>
              <p className="text-xs text-muted-foreground">Use literal values or organization secrets.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setValues((prev) => ({ ...prev, headers: [...prev.headers, { ...EMPTY_HEADER }] }))}
              data-testid={`${testIdPrefix}-add-header`}
            >
              Add header
            </Button>
          </div>
          {values.headers.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No headers configured.
            </p>
          ) : (
            <div className="space-y-3">
              {values.headers.map((header, index) => (
                <div key={index} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_120px_130px_1fr_auto]">
                  <Input
                    aria-label="Header name"
                    placeholder="Authorization"
                    value={header.name}
                    onChange={(event) => updateHeader(index, { name: event.target.value })}
                    data-testid={`${testIdPrefix}-header-name`}
                  />
                  <Select value={header.scheme} onValueChange={(scheme: HeaderSchemeSelection) => updateHeader(index, { scheme })}>
                    <SelectTrigger aria-label="Header scheme" data-testid={`${testIdPrefix}-header-scheme`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="bearer">Bearer</SelectItem>
                      <SelectItem value="basic">Basic</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={header.source} onValueChange={(source: HeaderCredentialSource) => updateHeader(index, { source, requiresValueReentry: false })}>
                    <SelectTrigger aria-label="Header source" data-testid={`${testIdPrefix}-header-source`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="value">Value</SelectItem>
                      <SelectItem value="secretId">Secret</SelectItem>
                    </SelectContent>
                  </Select>
                  {header.source === 'secretId' ? (
                    <div className="space-y-2">
                      <Input
                        aria-label="Search secrets"
                        placeholder="Search secrets"
                        value={secretSearchByHeader[index] ?? ''}
                        onChange={(event) => setSecretSearchByHeader((prev) => ({ ...prev, [index]: event.target.value }))}
                        data-testid={`${testIdPrefix}-header-secret-search`}
                      />
                      <Select value={header.value} onValueChange={(value) => updateHeader(index, { value, requiresValueReentry: false })}>
                        <SelectTrigger aria-label="Secret" data-testid={`${testIdPrefix}-header-secret`}>
                          <SelectValue placeholder="Select secret" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredSecretsByHeader(index).map((secret) => {
                            const secretId = secret.meta?.id ?? '';
                            return (
                              <SelectItem key={secretId} value={secretId}>
                                {secret.title || secret.remoteName || secretId}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <Input
                      aria-label="Header value"
                      type="password"
                      placeholder={header.requiresValueReentry ? 'Re-enter literal value' : 'header value'}
                      value={header.value}
                      onChange={(event) => updateHeader(index, { value: event.target.value, requiresValueReentry: false })}
                      data-testid={`${testIdPrefix}-header-value`}
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setValues((prev) => ({ ...prev, headers: prev.headers.filter((_, currentIndex) => currentIndex !== index) }))}
                    data-testid={`${testIdPrefix}-remove-header`}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
          {errors.headers ? <p className="text-sm text-destructive">{errors.headers}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" data-testid={`${testIdPrefix}-cancel`}>
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting} data-testid={`${testIdPrefix}-submit`}>
            {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create rule' : 'Save rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const headersFromValues = (headers: HeaderFormValues[]): EgressRuleHeader[] =>
  headers.map((header) => ({
    $typeName: 'agynio.api.egress.v1.EgressRuleHeader',
    name: header.name,
    scheme: schemeToProto(header.scheme),
    credential: { case: header.source, value: header.value },
  }));

export function OrganizationEgressRulesTab() {
  useDocumentTitle('Egress Rules');

  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRule, setEditRule] = useState<EgressRule | null>(null);
  const [deleteRule, setDeleteRule] = useState<EgressRule | null>(null);

  const rulesQuery = useQuery({
    queryKey: ['egressRules', organizationId, 'list'],
    queryFn: () => egressClient.listEgressRules({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const secretsQuery = useQuery({
    queryKey: ['secrets', organizationId, 'egress-selector'],
    queryFn: () => secretsClient.listSecrets({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '', secretProviderId: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const rules = rulesQuery.data?.egressRules ?? [];
  const secrets = secretsQuery.data?.secrets ?? [];
  const listControls = useListControls({
    items: rules,
    searchFields: [
      (rule) => rule.name,
      (rule) => rule.description,
      (rule) => rule.matcher?.domainPattern ?? '',
      (rule) => actionLabel(rule.effect?.action),
    ],
    sortOptions: {
      name: (rule) => rule.name,
      domain: (rule) => rule.matcher?.domainPattern ?? '',
      action: (rule) => actionLabel(rule.effect?.action),
      updated: (rule) => timestampToMillis(rule.meta?.updatedAt),
    },
    defaultSortKey: 'name',
  });

  const invalidateRules = () => {
    void queryClient.invalidateQueries({ queryKey: ['egressRules', organizationId, 'list'] });
  };

  const createRuleMutation = useMutation({
    mutationFn: (values: SubmitEgressRuleValues) =>
      egressClient.createEgressRule({
        organizationId,
        name: values.name,
        description: values.description,
        matcher: {
          domainPattern: values.domainPattern,
          ports: values.ports,
          methods: values.methods,
          pathPattern: values.pathPattern,
        },
        effect: {
          action: actionToProto(values.action),
          inject: headersFromValues(values.headers),
        },
      }),
    onSuccess: () => {
      toast.success('Egress rule created.');
      invalidateRules();
      setCreateOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create egress rule.');
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: (values: SubmitEgressRuleValues & { id: string }) =>
      egressClient.updateEgressRule({
        id: values.id,
        name: values.name,
        description: values.description,
        matcher: {
          domainPattern: values.domainPattern,
          ports: values.ports,
          methods: values.methods,
          pathPattern: values.pathPattern,
        },
        effect: {
          action: actionToProto(values.action),
          inject: headersFromValues(values.headers),
        },
      }),
    onSuccess: () => {
      toast.success('Egress rule updated.');
      invalidateRules();
      setEditRule(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update egress rule.');
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (ruleId: string) => egressClient.deleteEgressRule({ id: ruleId }),
    onSuccess: () => {
      toast.success('Egress rule deleted.');
      invalidateRules();
      setDeleteRule(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete egress rule.');
    },
  });

  const visibleRules = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground" data-testid="egress-rules-heading">
            Egress Rules
          </h2>
          <p className="text-sm text-muted-foreground">Manage outbound traffic policy and header injection.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="egress-rules-create-button">
          Create rule
        </Button>
      </div>
      <div className="max-w-sm">
        <Input
          placeholder="Search egress rules..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid="list-search"
        />
      </div>
      {rulesQuery.isPending ? <div className="text-sm text-muted-foreground">Loading egress rules...</div> : null}
      {rulesQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load egress rules.</div> : null}
      {rules.length === 0 && !rulesQuery.isPending ? (
        <Card className="border-border" data-testid="egress-rules-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No egress rules configured.
          </CardContent>
        </Card>
      ) : null}
      {rules.length > 0 ? (
        <Card className="border-border" data-testid="egress-rules-table">
          <CardContent className="px-0">
            <div className="grid gap-3 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_140px]">
              <SortableHeader label="Name" sortKey="name" activeSortKey={listControls.sortKey} sortDirection={listControls.sortDirection} onSort={listControls.handleSort} />
              <SortableHeader label="Domain" sortKey="domain" activeSortKey={listControls.sortKey} sortDirection={listControls.sortDirection} onSort={listControls.handleSort} />
              <span>Match</span>
              <SortableHeader label="Action" sortKey="action" activeSortKey={listControls.sortKey} sortDirection={listControls.sortDirection} onSort={listControls.handleSort} />
              <SortableHeader label="Updated" sortKey="updated" activeSortKey={listControls.sortKey} sortDirection={listControls.sortDirection} onSort={listControls.handleSort} />
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
              {visibleRules.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No egress rules configured.'}
                </div>
              ) : (
                visibleRules.map((rule) => {
                  const ruleId = rule.meta?.id ?? '';
                  return (
                    <div key={ruleId} className="grid items-center gap-3 px-6 py-4 text-sm text-foreground md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_140px]" data-testid="egress-rule-row">
                      <div>
                        <div className="font-medium" data-testid="egress-rule-name">{rule.name}</div>
                        {rule.description ? <div className="text-xs text-muted-foreground">{rule.description}</div> : null}
                      </div>
                      <span data-testid="egress-rule-domain">{rule.matcher?.domainPattern || '-'}</span>
                      <div className="text-xs text-muted-foreground">
                        <div>Ports: {formatPorts(rule.matcher?.ports ?? [])}</div>
                        <div>Methods: {formatMethods(rule.matcher?.methods ?? [])}</div>
                        {rule.matcher?.pathPattern ? <div>Path: {rule.matcher.pathPattern}</div> : null}
                      </div>
                      <span data-testid="egress-rule-action">{actionLabel(rule.effect?.action)}</span>
                      <span className="text-xs text-muted-foreground">{formatDateOnly(rule.meta?.updatedAt)}</span>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditRule(rule)} data-testid="egress-rule-edit">
                          Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleteRule(rule)} data-testid="egress-rule-delete">
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <EgressRuleDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialValues={DEFAULT_EGRESS_RULE_FORM_VALUES}
        onSubmit={(values) => createRuleMutation.mutate(values)}
        isSubmitting={createRuleMutation.isPending}
        secrets={secrets}
      />
      <EgressRuleDialog
        mode="edit"
        open={Boolean(editRule)}
        onOpenChange={(open) => {
          if (!open) setEditRule(null);
        }}
        initialValues={buildFormValuesFromRule(editRule)}
        onSubmit={(values) => {
          const ruleId = editRule?.meta?.id;
          if (!ruleId) {
            toast.error('Missing egress rule ID.');
            return;
          }
          updateRuleMutation.mutate({ ...values, id: ruleId });
        }}
        isSubmitting={updateRuleMutation.isPending}
        secrets={secrets}
      />
      <ConfirmDialog
        open={Boolean(deleteRule)}
        onOpenChange={(open) => {
          if (!open) setDeleteRule(null);
        }}
        title="Delete egress rule"
        description="This action permanently removes the rule and its attachments."
        confirmLabel="Delete rule"
        variant="danger"
        onConfirm={() => {
          const ruleId = deleteRule?.meta?.id;
          if (ruleId) deleteRuleMutation.mutate(ruleId);
        }}
        isPending={deleteRuleMutation.isPending}
      />
    </div>
  );
}
