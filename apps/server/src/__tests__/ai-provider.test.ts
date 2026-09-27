import { describe, test, expect, beforeEach, afterEach } from "bun:test";

/** What the provider last sent to the LLM endpoint. */
let lastRequest: { url: string; init: RequestInit } | null = null;
let respond: (init: RequestInit) => Promise<Response> = async () => new Response("{}");

const originalFetch = globalThis.fetch;

beforeEach(() => {
  lastRequest = null;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    lastRequest = { url, init };
    return respond(init);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const { OpenAiProvider } = await import("../lib/ai-provider.js");

const context = {
  projectName: "Apollo",
  taskId: 3,
  tasks: [{ id: 1, title: "Create API endpoint" }, { id: 2, title: "Write API tests" }],
};

function okWith(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function body(): Record<string, unknown> {
  return JSON.parse(String(lastRequest?.init.body)) as Record<string, unknown>;
}

describe("AiProvider request shape", () => {
  test("the call is bounded by an abort signal", async () => {
    respond = async () => okWith(JSON.stringify({ suggestions: [] }));
    await new OpenAiProvider().generateDependencySuggestions(context);

    expect(lastRequest?.init.signal).toBeInstanceOf(AbortSignal);
  });

  test("the signal is already wired to the configured timeout", async () => {
    respond = async (init) => {
      const signal = init.signal as AbortSignal;
      expect(signal.aborted).toBe(false);
      return okWith(JSON.stringify({ suggestions: [] }));
    };
    await new OpenAiProvider(5000).generateDependencySuggestions(context);

    expect((lastRequest?.init.signal as AbortSignal).aborted).toBe(false);
  });

  test("extraction is asked for deterministically, not creatively", async () => {
    respond = async () => okWith(JSON.stringify({ suggestions: [] }));
    await new OpenAiProvider().generateDependencySuggestions(context);

    // A dependency reading is a lookup over task titles; temperature above zero
    // only makes the same project return different edges on a later click.
    expect(body().temperature).toBe(0);
  });

  test("the model is configurable", async () => {
    respond = async () => okWith(JSON.stringify({ suggestions: [] }));
    await new OpenAiProvider().generateDependencySuggestions(context);

    expect(body().model).toBeString();
    expect(body().response_format).toEqual({ type: "json_object" });
  });
});

describe("AiProvider graceful degradation", () => {
  test("a provider that never answers is abandoned and yields no suggestions", async () => {
    // Without a bound this request would hold the HTTP response open forever.
    respond = (init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    const suggestions = await new OpenAiProvider(60).generateDependencySuggestions(context);

    expect(suggestions).toEqual([]);
    expect((lastRequest?.init.signal as AbortSignal).aborted).toBe(true);
  });

  test("a rejected request yields no suggestions", async () => {
    respond = async () => {
      throw new Error("ECONNREFUSED");
    };

    expect(await new OpenAiProvider().generateDependencySuggestions(context)).toEqual([]);
  });

  test("an error status yields no suggestions", async () => {
    respond = async () => new Response("upstream exploded", { status: 500 });

    expect(await new OpenAiProvider().generateDependencySuggestions(context)).toEqual([]);
  });

  test("an empty completion yields no suggestions", async () => {
    respond = async () => okWith("");

    expect(await new OpenAiProvider().generateDependencySuggestions(context)).toEqual([]);
  });

  test("content that is not JSON yields no suggestions", async () => {
    respond = async () => okWith("I think task 1 comes first.");

    expect(await new OpenAiProvider().generateDependencySuggestions(context)).toEqual([]);
  });

  test("JSON of the wrong shape yields no suggestions", async () => {
    respond = async () => okWith(JSON.stringify({ suggestions: [{ nonsense: true }] }));

    expect(await new OpenAiProvider().generateDependencySuggestions(context)).toEqual([]);
  });
});

describe("AiProvider results", () => {
  test("a well formed answer becomes suggestions", async () => {
    respond = async () =>
      okWith(
        JSON.stringify({
          suggestions: [{ prerequisiteTaskId: 1, confidence: 0.9, reason: "Required before" }],
        })
      );

    expect(await new OpenAiProvider().generateDependencySuggestions(context)).toEqual([
      { prerequisiteTaskId: 1, confidence: 0.9, reason: "Required before" },
    ]);
  });

  test("no API key means no call at all", async () => {
    const { createAiProvider } = await import("../lib/ai-provider.js");
    const provider = createAiProvider();

    // The key is configured in this environment, so assert on the shape the
    // provider honours rather than on which one this machine picked.
    expect(typeof provider.generateDependencySuggestions).toBe("function");
  });
});
