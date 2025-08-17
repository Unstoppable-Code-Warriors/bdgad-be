const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function zMidnightToVNStartUtc(z: string): string {
  return new Date(new Date(z).getTime() - VN_OFFSET_MS).toISOString();
}

export function zMidnightToVNEndUtc(z: string): string {
  return new Date(new Date(z).getTime() - VN_OFFSET_MS + (DAY_MS - 1)).toISOString();
}