import { db } from "@/lib/db";

/**
 * App settings persisted in the Setting table (key/value).
 */

export const SETTING_KEYS = {
  firmsMapKey: "firms_map_key",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  try {
    const row = await db.setting.findUnique({ where: { key } });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await db.setting.deleteMany({ where: { key } });
}

/** Resolve the FIRMS MAP_KEY: DB setting first, then env var. */
export async function resolveFirmsMapKey(): Promise<string | null> {
  const fromDb = await getSetting(SETTING_KEYS.firmsMapKey);
  if (fromDb && fromDb.trim()) return fromDb.trim();
  const fromEnv = process.env.FIRMS_MAP_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return null;
}
