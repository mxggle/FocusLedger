export function createId(prefix: string): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : fallbackId();
  return `${prefix}_${id}`;
}

function fallbackId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
