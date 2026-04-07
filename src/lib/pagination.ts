// API list calls use server-side pagination and may truncate large datasets.
// Keep page requests bounded to avoid oversized payloads.
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;
