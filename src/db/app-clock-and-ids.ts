// The ONLY file in src/db/ that reads the clock or random numbers. Everything
// else receives ids and timestamps from its caller. App code (stores, screens)
// uses these two helpers to make them; tests pass fixed values instead.

/** Current time as epoch milliseconds. */
export function appNow(): number {
  return Date.now();
}

let lastStamp = 0;
let counter = 0;

function randomSuffix(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A unique record id that sorts in creation order. Lists of events, readings
 * and answers are ordered by timestamp and then by id, so two records made in
 * the same millisecond keep the order they were created in.
 */
export function newRecordId(): string {
  const stamp = Date.now();
  if (stamp === lastStamp) {
    counter += 1;
  } else {
    lastStamp = stamp;
    counter = 0;
  }
  return `${stamp.toString(36).padStart(9, '0')}${counter.toString(36).padStart(4, '0')}${randomSuffix()}`;
}
