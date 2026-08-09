/** Requests are what scheduling reserves, so they are the useful number when
 * choosing between flavors; limits are the ceiling and are left out. */
export function describeResources(resources?: {
  requestsCpu: string;
  requestsMemory: string;
}): string | undefined {
  if (!resources) return undefined;
  const parts = [resources.requestsCpu, resources.requestsMemory].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : undefined;
}
