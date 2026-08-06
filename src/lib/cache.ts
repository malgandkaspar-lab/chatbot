import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { envBool, envStr } from "./env.js";

type Entry<T> = { expires: number; value: T };

/** TTL-id sekundites. */
export const TTL = {
  /** Statistikaamet uuendab kord aastas - 24h on helde. */
  STAT: 24 * 3600,
  /** Metsaregister uuendab igaoosel - 1h. */
  WFS: 3600,
  /** Aadressiotsing on stabiilne. */
  GEOCODE: 7 * 24 * 3600,
} as const;

function cacheDir(): string {
  return resolve(process.cwd(), envStr("CACHE_DIR", ".cache"));
}

function pathFor(key: string): string {
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 32);
  return join(cacheDir(), `${hash}.json`);
}

/**
 * Loeb cache'ist voi kutsub fn() ja salvestab.
 * Cache vead ei tohi kunagi paringut katki teha - koik on try/catch sees.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  // ttlSeconds <= 0 tahendab "ara kasuta cache'i" - vajalik testimiseks,
  // et moota tegelikku paringuaega.
  if (ttlSeconds <= 0 || !envBool("CACHE_ENABLED", true)) return fn();

  const file = pathFor(key);
  try {
    if (existsSync(file)) {
      const entry = JSON.parse(readFileSync(file, "utf8")) as Entry<T>;
      if (entry.expires > Date.now()) return entry.value;
    }
  } catch {
    // rikutud cache-fail - ignoreeri, pari uuesti
  }

  const value = await fn();

  try {
    mkdirSync(cacheDir(), { recursive: true });
    const entry: Entry<T> = { expires: Date.now() + ttlSeconds * 1000, value };
    writeFileSync(file, JSON.stringify(entry), "utf8");
  } catch {
    // kirjutamine ebaonnestus - pole kriitiline
  }

  return value;
}
