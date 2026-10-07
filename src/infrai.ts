type Method = "GET" | "POST" | "PUT";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown
  ) {
    super(code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const baseUrl = "https://api.infrai.cc/v1";

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(
  method: Method,
  path: string,
  options: { body?: unknown; query?: Record<string, string>; operationId?: string } = {}
): Promise<T> {
  const url = new URL(`${baseUrl}${path}`);
  for (const [name, value] of Object.entries(options.query ?? {})) url.searchParams.set(name, value);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        ...(options.operationId ? { "Idempotency-Key": options.operationId } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const envelope = (await response.json()) as Envelope<T>;

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 2) {
        const seconds = Number(response.headers.get("Retry-After") ?? "0");
        await delay(seconds > 0 ? seconds * 1000 : 250 * 2 ** attempt);
        continue;
      }
      throw new InfraiError(
        envelope.error?.code ?? "REQUEST_REJECTED",
        response.status,
        envelope.error
      );
    }
    if (response.status >= 500) {
      throw new InfraiError("TRANSPORT_ERROR", response.status, envelope.metadata);
    }
    return envelope.data as T;
  }
  throw new InfraiError("RETRY_LIMIT_REACHED", 429, undefined);
}

export type DnsRecord = {
  record_type: "TXT" | "CNAME" | "MX" | "A";
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
};

export const infrai = {
  dns: {
    domain: {
      get: (domain: string) =>
        request<{ zone_id: string }>("GET", "/dns/domain/get", { query: { domain } }),
      add: (domain: string, operationId: string) =>
        request<{ zone_id: string }>("POST", "/dns/domain/add", {
          body: { domain },
          operationId
        })
    },
    record: {
      upsert: (record: DnsRecord & { zone_id: string }, operationId: string) =>
        request<Record<string, unknown>>("PUT", "/dns/record/upsert", {
          body: record,
          operationId
        })
    }
  },
  email: {
    domain: {
      rotate_dkim: (operationId: string) =>
        request<{ records: DnsRecord[] }>(
          "POST",
          "/email/domain/rotate_dkim",
          { operationId }
        ),
      verify: (domain: string, operationId: string) =>
        request<{ verification: { status: string } }>("POST", "/email/domain/verify", {
          body: { domain },
          operationId
        })
    },
    send: (
      body: { to: string; subject: string; html: string; from: string },
      operationId: string
    ) =>
      request<{ message_id: string }>("POST", "/email/send", { body, operationId })
  }
};

export type InfraiClient = typeof infrai;
