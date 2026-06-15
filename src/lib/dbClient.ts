export async function dbGet<T>(entity: string): Promise<T[]> {
  const res = await fetch(`/api/db/${entity}`);
  if (!res.ok) throw new Error(`DB GET ${entity} failed`);
  const { items } = await res.json();
  return items as T[];
}

export async function dbSave<T extends { id: string }>(entity: string, items: T[]): Promise<void> {
  await fetch(`/api/db/${entity}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

export async function dbDelete(entity: string, id: string): Promise<void> {
  await fetch(`/api/db/${entity}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
