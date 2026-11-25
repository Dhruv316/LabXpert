/** Timestamp first, then id (ids from `newRecordId` sort in creation order). */
export function byTimestampThenId<T extends { id: string; timestamp: number }>(a: T, b: T): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
