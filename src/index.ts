export type JobProvider = "greenhouse" | "lever" | "ashby";
export type JobBoard = {
  provider: JobProvider;
  board: string;
  region?: "global" | "eu";
};
export type JobListing = {
  /** Stable within this provider, region, and board. Not a cross-board employer identity. */
  key: string;
  provider: JobProvider;
  board: string;
  sourceId: string;
  title: string;
  url: string;
  location: string | null;
  workplace: "remote" | "hybrid" | "onsite" | null;
  employmentType: string | null;
  description: { text: string; format: "plain" | "html" };
  /** Source timestamp semantics are deliberately distinct. */
  publishedAt: string | null;
  updatedAt: string | null;
  observedAt: string;
  /** Provider-native compensation preserves tiers, intervals, equity, and unknowns. */
  compensation: Record<string, unknown> | null;
};
export type JobFeedResult = {
  source: JobBoard;
  jobs: JobListing[];
  status: "complete" | "partial" | "failed";
  observedAt: string;
  requests: number;
  issues: {
    code:
      | "http"
      | "network"
      | "invalid-response"
      | "invalid-listing"
      | "limit"
      | "cancelled";
    status?: number;
    retryAfter?: string;
  }[];
};
export type JobSourceOptions = {
  /** Required: the host supplies its authorized, bounded egress transport. */
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  maxPages?: number;
  maxJobs?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
};
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const date = (value: unknown) => {
  const input = text(value);
  return input && Number.isFinite(Date.parse(input))
    ? new Date(input).toISOString()
    : null;
};
const url = (value: unknown) => {
  const input = text(value);
  if (!input) return null;
  try {
    const parsed = new URL(input);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.href
      : null;
  } catch {
    return null;
  }
};
const limit = (value: number | undefined, fallback: number, max: number) => {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 1 || n > max)
    throw new Error("Invalid job source limit");
  return n;
};
export const validateJobBoard = (input: JobBoard): JobBoard => {
  if (
    !input ||
    !["greenhouse", "lever", "ashby"].includes(input.provider) ||
    typeof input.board !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(input.board)
  )
    throw new Error("Choose a provider and its board identifier (not a URL)");
  if (input.region !== undefined && !["global", "eu"].includes(input.region))
    throw new Error("Invalid region");
  if (input.region === "eu" && input.provider !== "lever")
    throw new Error("EU region is only supported for Lever");
  return {
    provider: input.provider,
    board: input.board,
    ...(input.provider === "lever" ? { region: input.region ?? "global" } : {}),
  };
};
/** Recognize a hosted careers/job URL without fetching it or following redirects.
 * Returns null for custom domains, unsupported hosts and malformed identifiers. */
export const parseJobBoardUrl = (input: string): JobBoard | null => {
  if (typeof input !== "string" || input.length > 4096) return null;
  try {
    const parsed = new URL(input.trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
    const host = parsed.hostname;
    let provider: JobProvider;
    let region: "global" | "eu" | undefined;
    if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") provider = "greenhouse";
    else if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
      provider = "lever";
      region = host === "jobs.eu.lever.co" ? "eu" : "global";
    } else if (host === "jobs.ashbyhq.com") provider = "ashby";
    else return null;
    const segments = parsed.pathname.split("/");
    const board = provider === "greenhouse" && segments[1] === "embed" && ["job_board", "job_app"].includes(segments[2] ?? "")
      ? parsed.searchParams.get("for") : segments[1];
    if (!board || board === "embed") return null;
    return validateJobBoard({provider, board, ...(region ? {region} : {})});
  } catch { return null; }
};

export const jobBoardKey = (input: JobBoard) => {
  const board = validateJobBoard(input);
  return `${board.provider}:${board.region ?? "global"}:${board.board}`;
};
const endpoint = (source: JobBoard, skip: number, pageSize: number) => {
  const board = encodeURIComponent(source.board);
  if (source.provider === "greenhouse")
    return `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
  if (source.provider === "ashby")
    return `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`;
  return `https://${source.region === "eu" ? "api.eu.lever.co" : "api.lever.co"}/v0/postings/${board}?mode=json&skip=${skip}&limit=${pageSize}`;
};
const normalize = (
  raw: unknown,
  source: JobBoard,
  observedAt: string,
): JobListing | null => {
  const row = object(raw);
  if (!row) throw new Error("Invalid listing");
  if (source.provider === "ashby" && row.isListed === false) return null;
  if (source.provider === "greenhouse" && row.internal_job_id === null)
    return null; // Prospect pools are not open roles.
  const categories = object(row.categories);
  const ashby = source.provider === "ashby";
  const lever = source.provider === "lever";
  const href = url(
    ashby ? row.jobUrl : lever ? row.hostedUrl : row.absolute_url,
  );
  const title = text(lever ? row.text : row.title);
  const id = ashby
    ? href
    : typeof row.id === "number" && Number.isSafeInteger(row.id)
      ? String(row.id)
      : text(row.id);
  if (!href || !title || !id) throw new Error("Invalid listing identity");
  const workplaceValue = text(row.workplaceType)?.toLowerCase();
  const workplace =
    workplaceValue === "remote"
      ? "remote"
      : workplaceValue === "hybrid"
        ? "hybrid"
        : ["onsite", "on-site"].includes(workplaceValue ?? "")
          ? "onsite"
          : null;
  const descriptionPlain = text(row.descriptionPlain);
  const description =
    ashby || lever
      ? {
          text: [
            descriptionPlain ?? "",
            text(row.additionalPlain) ?? "",
            ...(Array.isArray(row.lists)
              ? row.lists.map((item) => {
                  const part = object(item);
                  return [text(part?.text), text(part?.content)]
                    .filter(Boolean)
                    .join("\n");
                })
              : []),
          ]
            .filter(Boolean)
            .join("\n\n"),
          format:
            lever && Array.isArray(row.lists) && row.lists.length
              ? ("html" as const)
              : ("plain" as const),
        }
      : { text: text(row.content) ?? "", format: "html" as const };
  return {
    key: `${jobBoardKey(source)}:${id}`,
    provider: source.provider,
    board: source.board,
    sourceId: id,
    title,
    url: href,
    location: text(
      ashby
        ? row.location
        : lever
          ? categories?.location
          : object(row.location)?.name,
    ),
    workplace,
    employmentType: text(ashby ? row.employmentType : categories?.commitment),
    description,
    publishedAt: ashby ? date(row.publishedAt) : null,
    updatedAt: source.provider === "greenhouse" ? date(row.updated_at) : null,
    observedAt,
    compensation: object(
      ashby ? row.compensation : lever ? row.salaryRange : null,
    ),
  };
};
async function readJson(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  if (!response.body) throw new Error("Missing body");
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new Error("Response too large");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export const createJobSource = (options: JobSourceOptions) => {
  const maxPages = limit(options.maxPages, 10, 100),
    maxJobs = limit(options.maxJobs, 2000, 10000),
    maxBytes = limit(
      options.maxResponseBytes,
      8 * 1024 * 1024,
      32 * 1024 * 1024,
    ),
    timeout = limit(options.timeoutMs, 20000, 120000);
  return {
    async list(input: JobBoard, signal?: AbortSignal): Promise<JobFeedResult> {
      const source = validateJobBoard(input),
        observedAt = new Date().toISOString();
      const result: JobFeedResult = {
        source,
        jobs: [],
        status: "complete",
        observedAt,
        requests: 0,
        issues: [],
      };
      const combined = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout);
      const seen = new Set<string>();
      const pageSize = 100;
      for (let page = 0; page < maxPages; page++) {
        let response: Response;
        try {
          combined.throwIfAborted();
          result.requests++;
          response = await options.fetch(
            endpoint(source, page * pageSize, pageSize),
            {
              method: "GET",
              headers: { accept: "application/json" },
              redirect: "error",
              signal: combined,
            },
          );
        } catch {
          result.issues.push({
            code: combined.aborted ? "cancelled" : "network",
          });
          break;
        }
        if (!response.ok) {
          result.issues.push({
            code: "http",
            status: response.status,
            ...(response.headers.get("retry-after")
              ? { retryAfter: response.headers.get("retry-after")! }
              : {}),
          });
          await response.body?.cancel();
          break;
        }
        let rows: unknown[];
        try {
          const body = await readJson(response, maxBytes);
          const raw = source.provider === "lever" ? body : object(body)?.jobs;
          if (!Array.isArray(raw)) throw new Error("Invalid response");
          rows = raw;
        } catch {
          result.issues.push({
            code: combined.aborted ? "cancelled" : "invalid-response",
          });
          break;
        }
        for (const row of rows) {
          try {
            const job = normalize(row, source, observedAt);
            if (!job) continue;
            if (seen.has(job.key)) {
              result.issues.push({ code: "invalid-listing" });
              continue;
            }
            if (result.jobs.length >= maxJobs) {
              result.issues.push({ code: "limit" });
              break;
            }
            seen.add(job.key);
            result.jobs.push(job);
          } catch {
            result.issues.push({ code: "invalid-listing" });
          }
        }
        if (result.issues.some((i) => i.code === "limit")) break;
        if (source.provider !== "lever" || rows.length < pageSize) break;
        if (page === maxPages - 1) result.issues.push({ code: "limit" });
      }
      if (result.issues.length)
        result.status = result.jobs.length ? "partial" : "failed";
      return result;
    },
  };
};
