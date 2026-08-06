const USER_AGENT =
  "metsabot/0.1 (Eesti metsainfo chatbot; avaandmete kasutus)";

export class HttpError extends Error {
  constructor(
    override readonly message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export type FetchOpts = {
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  /** Millisekundid. Vaikimisi 30 s. */
  timeoutMs?: number;
  /** Mitu korda korrata 5xx / vorgu vea korral. Vaikimisi 2. */
  retries?: number;
};

/**
 * fetch timeoutiga, retry'ga ja korraliku User-Agentiga.
 * Riiklikud teenused on aeglased ja kohati ebastabiilsed, seega retry on vajalik.
 * 4xx-i EI korrata (meie paring on vale, kordamine ei aita).
 */
export async function request(url: string, opts: FetchOpts = {}): Promise<string> {
  const {
    method = "GET",
    body,
    headers = {},
    timeoutMs = 30_000,
    retries = 2,
  } = opts;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // eksponentsiaalne backoff: 500ms, 1500ms
      await sleep(500 * 3 ** (attempt - 1));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { "User-Agent": USER_AGENT, ...headers },
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new HttpError(
          `${res.status} ${res.statusText}: ${text.slice(0, 300)}`,
          res.status,
          url,
        );
        // kliendi viga - ara korda
        if (res.status >= 400 && res.status < 500) throw err;
        lastError = err;
        continue;
      }

      return await res.text();
    } catch (err) {
      if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
        throw err;
      }
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Paring ebaonnestus: ${url}`);
}

export async function getJson<T>(url: string, opts?: FetchOpts): Promise<T> {
  const text = await request(url, {
    ...opts,
    headers: { Accept: "application/json", ...opts?.headers },
  });
  return parseJson<T>(text, url);
}

export async function postJson<T>(
  url: string,
  payload: unknown,
  opts?: FetchOpts,
): Promise<T> {
  const text = await request(url, {
    ...opts,
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...opts?.headers,
    },
  });
  return parseJson<T>(text, url);
}

function parseJson<T>(text: string, url: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Vigane JSON vastus (${url}): ${text.slice(0, 200)}`,
    );
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Ehitab query-stringi, jattes vahele undefined vaartused. */
export function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join("&");
}
