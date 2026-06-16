export async function dbGet<T>(entity: string): Promise<T[]> {
  const res = await fetch(`/api/db/${entity}`);
  if (!res.ok) throw new Error(`DB GET ${entity} failed: ${res.status}`);
  const { items } = await res.json();
  return items as T[];
}

export async function dbSave<T extends { id: string }>(entity: string, items: T[]): Promise<void> {
  const res = await fetch(`/api/db/${entity}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`DB SAVE ${entity} failed: ${res.status}`);
}
