export type LabelEntry = {
  id: string;
  key: string;
  value: string;
};

function buildLabelId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createLabelEntry(): LabelEntry {
  return { id: buildLabelId(), key: '', value: '' };
}

export function labelsToEntries(labels: Record<string, string>): LabelEntry[] {
  return Object.entries(labels).map(([key, value]) => ({ id: buildLabelId(), key, value }));
}

export function entriesToLabels(entries: LabelEntry[]): Record<string, string> {
  return entries.reduce<Record<string, string>>((acc, entry) => {
    const trimmedKey = entry.key.trim();
    if (!trimmedKey) return acc;
    acc[trimmedKey] = entry.value.trim();
    return acc;
  }, {});
}
