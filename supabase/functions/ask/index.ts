declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-requested-with",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

type AskRequestBody = {
  question: string;
};

type AnthropicContentBlockDeltaEvent = {
  type: "content_block_delta";
  delta?: {
    text?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAskRequestBody(value: unknown): value is AskRequestBody {
  if (!isRecord(value)) return false;
  return typeof value.question === "string";
}

function isAnthropicContentBlockDeltaEvent(value: unknown): value is AnthropicContentBlockDeltaEvent {
  if (!isRecord(value)) return false;
  if (value.type !== "content_block_delta") return false;
  const delta = value.delta;
  if (delta === undefined) return true;
  if (!isRecord(delta)) return false;
  return delta.text === undefined || typeof delta.text === "string";
}

function streamAnthropicText(sseBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = sseBody.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Anthropic streaming is SSE-like: events separated by double newlines.
          // We parse `data:` lines and emit only `content_block_delta.delta.text`.
          let sepIndex: number;
          while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sepIndex);
            buffer = buffer.slice(sepIndex + 2);

            const dataLines = rawEvent
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice("data:".length).trim());

            for (const data of dataLines) {
              if (!data || data === "[DONE]") continue;

              try {
                const evtUnknown: unknown = JSON.parse(data);
                if (!isAnthropicContentBlockDeltaEvent(evtUnknown)) continue;
                const text = evtUnknown.delta?.text;
                if (typeof text === "string" && text.length > 0) controller.enqueue(encoder.encode(text));
              } catch {
                // Ignore non-JSON data frames.
              }
            }
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // no-op
        }
        controller.close();
      }
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Bypass JWT verification - we handle auth ourselves
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("apikey");
  if (!authHeader) {
    return jsonResponse(401, { error: "Missing authorization header" });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse(500, { error: "Missing ANTHROPIC_API_KEY" });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  if (!isAskRequestBody(payload) || payload.question.trim().length === 0) {
    return jsonResponse(400, { error: "Body must be { question: string }" });
  }
  const question = payload.question.trim();

  const system =
    "You are a science-based fitness and nutrition assistant. \n" +
    "You only answer questions about weightlifting, exercise, and nutrition.\n" +
    "For every answer you give:\n" +
    "- Keep it to 2-3 sentences maximum\n" +
    "- Write in plain english, not academic language\n" +
    "- Always cite the source of your information (study name or publication)\n" +
    "- If the question is not about fitness or nutrition, politely decline to answer";

  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001";

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system,
      messages: [{ role: "user", content: question }],
      max_tokens: 400,
      stream: true,
    }),
  });

  if (!anthropicRes.ok) {
    const raw = await anthropicRes.text().catch(() => "");
    let details: unknown = raw || undefined;
    try {
      details = raw ? JSON.parse(raw) : undefined;
    } catch {
      // leave as raw string
    }
    return jsonResponse(anthropicRes.status, {
      error: "Anthropic request failed",
      details,
    });
  }

  if (!anthropicRes.body) {
    return jsonResponse(502, { error: "Anthropic response had no body" });
  }

  const textStream = streamAnthropicText(anthropicRes.body);

  return new Response(textStream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
});

