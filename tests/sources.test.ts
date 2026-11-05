import { test, expect } from "bun:test";
import { createJobSource, validateJobBoard } from "../src";
const posting = (id = "1") => ({
  id,
  text: "Engineer",
  hostedUrl: `https://jobs.lever.co/example/${id}`,
  categories: { location: "US" },
  descriptionPlain: "Build software",
});
test("validates source before network and keeps URLs on fixed provider hosts", async () => {
  let called = false;
  const client = createJobSource({
    fetch: async () => {
      called = true;
      return Response.json([]);
    },
  });
  await expect(
    client.list({ provider: "lever", board: "../private" }),
  ).rejects.toThrow();
  expect(called).toBe(false);
  expect(() =>
    validateJobBoard({ provider: "ashby", board: "ok", region: "eu" }),
  ).toThrow();
  const urls: string[] = [];
  await createJobSource({
    fetch: async (url) => {
      urls.push(url);
      return Response.json([]);
    },
  }).list({ provider: "lever", board: "example", region: "eu" });
  expect(urls[0]).toStartWith("https://api.eu.lever.co/v0/postings/example?");
});
test("Greenhouse update is not a publication date and prospect pools are omitted", async () => {
  const client = createJobSource({
    fetch: async () =>
      Response.json({
        jobs: [
          {
            id: 1,
            title: "Engineer",
            absolute_url: "https://example.com/job",
            updated_at: "2026-01-01T00:00:00Z",
            content: "&lt;p&gt;Work&lt;/p&gt;",
          },
          { id: 2, internal_job_id: null },
        ],
      }),
  });
  const result = await client.list({
    provider: "greenhouse",
    board: "example",
  });
  expect(result.status).toBe("complete");
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0]?.publishedAt).toBeNull();
  expect(result.jobs[0]?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  expect(result.jobs[0]?.compensation).toBeNull();
});
test("Ashby hybrid is not inferred remote from isRemote, unlisted roles stay out", async () => {
  const client = createJobSource({
    fetch: async () =>
      Response.json({
        jobs: [
          {
            title: "Engineer",
            jobUrl: "https://jobs.ashbyhq.com/example/1",
            workplaceType: "Hybrid",
            isRemote: true,
            compensation: {
              summaryComponents: [
                { compensationType: "EquityPercentage", minValue: 0.5 },
              ],
            },
          },
          { isListed: false },
        ],
      }),
  });
  const result = await client.list({ provider: "ashby", board: "example" });
  expect(result.status).toBe("complete");
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0]?.workplace).toBe("hybrid");
  expect(result.jobs[0]?.compensation?.summaryComponents).toHaveLength(1);
});
test("Lever pagination preserves partial results and Retry-After on later failure", async () => {
  let calls = 0;
  const client = createJobSource({
    fetch: async () =>
      ++calls === 1
        ? Response.json(
            Array.from({ length: 100 }, (_, i) => posting(String(i))),
          )
        : new Response("", { status: 429, headers: { "retry-after": "60" } }),
  });
  const result = await client.list({ provider: "lever", board: "example" });
  expect(result.status).toBe("partial");
  expect(result.jobs).toHaveLength(100);
  expect(result.requests).toBe(2);
  expect(result.issues[0]).toEqual({
    code: "http",
    status: 429,
    retryAfter: "60",
  });
});
test("empty, malformed, truncated, duplicate and unsafe listings stay distinguishable", async () => {
  const list = async (body: unknown, options = {}) =>
    createJobSource({
      fetch: async () => Response.json(body),
      ...options,
    }).list({ provider: "lever", board: "example" });
  expect((await list([])).status).toBe("complete");
  expect((await list({})).status).toBe("failed");
  const duplicate = await list([posting(), posting()]);
  expect(duplicate.jobs).toHaveLength(1);
  expect(duplicate.status).toBe("partial");
  expect(
    (await list([{ ...posting(), hostedUrl: "javascript:alert(1)" }])).status,
  ).toBe("failed");
  expect(
    (await list([posting("1"), posting("2")], { maxJobs: 1 })).status,
  ).toBe("partial");
  expect((await list([posting()], { maxResponseBytes: 1 })).status).toBe(
    "failed",
  );
  expect(
    (
      await list(
        Array.from({ length: 100 }, (_, i) => posting(String(i))),
        { maxPages: 1 },
      )
    ).status,
  ).toBe("partial");
});
test("aborted retrieval makes no transport call", async () => {
  let calls = 0;
  const abort = new AbortController();
  abort.abort();
  const result = await createJobSource({
    fetch: async () => {
      calls++;
      return Response.json([]);
    },
  }).list({ provider: "lever", board: "example" }, abort.signal);
  expect(calls).toBe(0);
  expect(result.issues[0]?.code).toBe("cancelled");
});
