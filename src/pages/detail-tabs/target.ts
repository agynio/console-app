// ENVs, egress rules and image pull secrets all attach to more than one kind of
// entity, so the tabs that manage them are shared and told which entity they are
// looking at. The kind doubles as the data-testid and element id prefix: the
// agent tabs came first, so 'agent' has to keep producing the ids it always did.
export type DetailTarget = { kind: 'agent'; id: string } | { kind: 'environment'; id: string };
