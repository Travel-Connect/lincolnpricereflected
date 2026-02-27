/**
 * Helper to cast Supabase query results to application types.
 * Centralizes the type cast boundary so individual pages don't need `as unknown as`.
 */
export function typedData<T>(data: unknown): T {
  return data as T;
}

export function typedDataOrEmpty<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}
