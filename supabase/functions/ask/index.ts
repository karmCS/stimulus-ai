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

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

type AskRequestBody = {
  question: string;
};

type SingleAgentBlockedReason =
  | "ped"
  | "extreme_diet"
  | "medical_diagnosis"
  | "off_topic";

type SingleAgentBlockedResponse = {
  blocked: true;
  reason: SingleAgentBlockedReason;
};

type SingleAgentOkResponse = {
  blocked: false;
  verdictLabel: string;
  oneLineVerdict: string;
  simpleExplanation: string;
  theWhy: string;
  whatMattersMore: string;
  whoShouldCare: string;
  bottomLine: string;
  followUps: [string, string, string];
  uncertainty?: string;
};

type SingleAgentResponse = SingleAgentBlockedResponse | SingleAgentOkResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAskRequestBody(value: unknown): value is AskRequestBody {
  if (!isRecord(value)) return false;
  return typeof value.question === "string";
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function sanitizeJson(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

function extractFirstJsonValue(text: string): string | null {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenceMatch?.[1]?.trim() ?? trimmed).trim();

  // Fast path: whole candidate is a JSON value
  if (
    (candidate.startsWith("{") && candidate.endsWith("}")) ||
    (candidate.startsWith("[") && candidate.endsWith("]"))
  ) {
    return candidate;
  }

  const firstObj = candidate.indexOf("{");
  const firstArr = candidate.indexOf("[");
  if (firstObj === -1 && firstArr === -1) return null;

  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  const openChar = candidate[start];
  const closeChar = openChar === "{" ? "}" : "]";

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === openChar) depth++;
    if (ch === closeChar) {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return null;
}

function normalizeTopic(text: string): string {
  const lowered = text.toLowerCase();
  const stripped = lowered.replace(/[^\p{L}\p{N}\s]/gu, " ");
  return stripped.replace(/\s+/g, " ").trim();
}

const SINGLE_AGENT_SYSTEM_PROMPT = `You are a world-class strength and conditioning coach and sports science educator. 
Your personality and lifting knowledge is adjacent to Elijah Mundy, Keenan Mallory, Paul Carter, or TNF, who are prominent figures in the science-based lifting community on TikTok.

You have deep expertise in:
- Strength training and programming (powerlifting, general strength, periodization)
- Hypertrophy and muscle building (volume, intensity, frequency, exercise selection)
- Nutrition and diet (protein, macros, caloric targets, meal timing, supplementation)
- Recovery and sleep (fatigue management, sleep and performance)

You serve lifters of ALL experience levels — from someone doing their first squat to competitive athletes. You automatically detect the user's experience level from the language and context of their question and adjust your depth and terminology accordingly.

Your coaching style is a blend of two things:
- A no-nonsense coach: direct, practical, zero fluff. You tell people what actually matters and what to do.
- A science educator: you briefly explain the "why" behind your advice so the user understands and trusts it, not just follows it.

You NEVER give generic, hedged, or wishy-washy answers. You give a clear position and explain your reasoning.

---

SAFETY RULES — enforce these strictly:
- If the question involves PEDs, anabolic steroids, SARMs, peptides, or any performance-enhancing drug, respond with: { "blocked": true, "reason": "ped" }
- If the question involves extreme cutting (under 1000 kcal/day), disordered eating, or dangerous weight-cutting methods, respond with: { "blocked": true, "reason": "extreme_diet" }
- If the question asks you to diagnose a medical condition, prescribe medication, or interpret medical test results, respond with: { "blocked": true, "reason": "medical_diagnosis" }
- If the question is completely unrelated to fitness, training, nutrition, or recovery, respond with: { "blocked": true, "reason": "off_topic" }

---

OUTPUT RULES:
- You MUST respond only with a valid JSON object. No markdown, no preamble, no explanation outside the JSON.
- Every field in the schema below is required unless marked optional.
- Keep language clear and direct. No bullet-point walls. Write like a smart coach texting a client, not a fitness blog.
- Maximum 3 follow-up questions.
- uncertainty must be honest — if the evidence is genuinely mixed or individual response varies, say so plainly.

---

OUTPUT SCHEMA:

{
  "blocked": false,
  "verdictLabel": "string — 2-4 word label summarizing your stance e.g. 'Yes, prioritize this' or 'Mostly a myth'",
  "oneLineVerdict": "string — one punchy sentence, your clear position on the question",
  "simpleExplanation": "string — 2-4 sentences. The core answer in plain language. Lead with what matters most.",
  "theWhy": "string — 2-3 sentences. The mechanism or science behind your answer. Not a literature review — just the key reason this is true.",
  "whatMattersMore": "string — 1-2 sentences. The most important variable the user should actually focus on. Often this reframes the question.",
  "whoShouldCare": "string — 1-2 sentences. Who this matters most for and who can safely ignore it.",
  "bottomLine": "string — 1 sentence. The single most actionable takeaway.",
  "followUps": ["string", "string", "string"],
  "uncertainty": "string — optional. Only include if evidence is genuinely mixed, highly individual, or emerging. Be specific about what is uncertain and why."
}`;

function looksLikeBlockedResponse(value: unknown): value is SingleAgentBlockedResponse {
  if (!isRecord(value)) return false;
  return value.blocked === true && typeof value.reason === "string";
}

function looksLikeOkResponse(value: unknown): value is SingleAgentOkResponse {
  if (!isRecord(value)) return false;
  if (value.blocked !== false) return false;
  const requiredStringKeys = [
    "verdictLabel",
    "oneLineVerdict",
    "simpleExplanation",
    "theWhy",
    "whatMattersMore",
    "whoShouldCare",
    "bottomLine",
  ] as const;
  for (const k of requiredStringKeys) {
    if (typeof value[k] !== "string") return false;
  }
  if (!Array.isArray(value.followUps) || value.followUps.length !== 3) return false;
  if (!value.followUps.every((x) => typeof x === "string")) return false;
  if (value.uncertainty !== undefined && typeof value.uncertainty !== "string") return false;
  return true;
}

function coerceSingleAgentResponse(value: unknown): SingleAgentResponse | null {
  // Already in the right shape
  if (looksLikeBlockedResponse(value) || looksLikeOkResponse(value)) {
    return value as SingleAgentResponse;
  }

  // If the DB column is `text` (or evidence was stored as a JSON string),
  // PostgREST will return a string. Try to recover it.
  if (typeof value === "string") {
    const jsonText = extractFirstJsonValue(value);
    const parsedUnknown = jsonText ? safeJsonParse(sanitizeJson(jsonText)) : undefined;
    if (looksLikeBlockedResponse(parsedUnknown) || looksLikeOkResponse(parsedUnknown)) {
      return parsedUnknown as SingleAgentResponse;
    }
  }

  // Some callers might have stored the full SSE wrapper shape
  // { type: "final", data: <response> }. Recover that too.
  if (isRecord(value) && "data" in value) {
    const inner = (value as any).data;
    if (looksLikeBlockedResponse(inner) || looksLikeOkResponse(inner)) {
      return inner as SingleAgentResponse;
    }
    if (typeof inner === "string") {
      const jsonText = extractFirstJsonValue(inner);
      const parsedUnknown = jsonText ? safeJsonParse(sanitizeJson(jsonText)) : undefined;
      if (looksLikeBlockedResponse(parsedUnknown) || looksLikeOkResponse(parsedUnknown)) {
        return parsedUnknown as SingleAgentResponse;
      }
    }
  }

  return null;
}

async function anthropicMessageText(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.2,
      stream: false,
    }),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(`Anthropic request failed (${res.status}): ${raw || res.statusText}`);
  }

  const bodyUnknown: unknown = await res.json().catch(() => undefined);
  if (!isRecord(bodyUnknown)) throw new Error("Anthropic response was not an object");
  const content = bodyUnknown.content;
  if (!Array.isArray(content)) throw new Error("Anthropic response missing content[]");
  const first = content[0];
  if (!isRecord(first) || first.type !== "text" || typeof first.text !== "string") {
    throw new Error("Anthropic response content[0] was not text");
  }
  return first.text;
}

async function insertSupabaseRow(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  table: string;
  row: Record<string, unknown>;
}): Promise<unknown> {
  const url = `${opts.supabaseUrl.replace(/\/+$/, "")}/rest/v1/${opts.table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: opts.serviceRoleKey,
      Authorization: `Bearer ${opts.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(opts.row),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Supabase insert failed (${opts.table}) (${res.status}): ${text || res.statusText}`,
    );
  }
  return await res.json().catch(() => undefined);
}

async function fetchSupabaseRows(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  pathAndQuery: string;
}): Promise<unknown> {
  const url = `${opts.supabaseUrl.replace(/\/+$/, "")}/rest/v1/${opts.pathAndQuery}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: opts.serviceRoleKey,
      Authorization: `Bearer ${opts.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase fetch failed (${res.status}): ${text || res.statusText}`);
  }
  return await res.json().catch(() => undefined);
}

async function upsertSupabaseRow(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  table: string;
  row: Record<string, unknown>;
  onConflict: string;
}): Promise<unknown> {
  const url =
    `${opts.supabaseUrl.replace(/\/+$/, "")}/rest/v1/${opts.table}?on_conflict=${encodeURIComponent(opts.onConflict)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: opts.serviceRoleKey,
      Authorization: `Bearer ${opts.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(opts.row),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Supabase upsert failed (${opts.table}) (${res.status}): ${text || res.statusText}`,
    );
  }
  return await res.json().catch(() => undefined);
}

function elapsedMs(start: number): number {
  return Math.max(0, Date.now() - start);
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

  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

  // Always respond via SSE for POST requests.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: "stage" | "final" | "error", data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // 1) SSE: thinking immediately
      send("stage", { type: "stage", stage: "thinking" });

      const startedAll = Date.now();

      // Create run row (best-effort).
      let runId: string = crypto.randomUUID();
      try {
        if (supabaseUrl && serviceRoleKey) {
          const inserted = await insertSupabaseRow({
            supabaseUrl,
            serviceRoleKey,
            table: "agent_runs",
            row: { id: runId, user_query: question, model },
          });
          if (Array.isArray(inserted) && inserted[0] && typeof inserted[0].id === "string") {
            runId = inserted[0].id;
          }
        }
      } catch (e) {
        console.log("agent_runs insert failed:", (e as Error)?.message ?? e);
      }

      const logRunBestEffort = async (data: Record<string, unknown>) => {
        try {
          if (!runId || !supabaseUrl || !serviceRoleKey) return;
          const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/agent_runs?id=eq.${runId}`;
          await fetch(url, {
            method: "PATCH",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          }).catch(() => {});
        } catch {
          // ignore
        }
      };

      const logStepBestEffort = async (step: {
        status: "ok" | "error";
        latencyMs: number;
        input: unknown;
        output: unknown;
        error: string | null;
      }) => {
        try {
          if (!supabaseUrl || !serviceRoleKey) return;
          await insertSupabaseRow({
            supabaseUrl,
            serviceRoleKey,
            table: "agent_steps",
            row: {
              run_id: runId,
              agent_name: "single_agent",
              status: step.status,
              latency_ms: step.latencyMs,
              input: step.input as any,
              output: step.output as any,
              error: step.error,
            },
          });
        } catch (e) {
          console.log("agent_steps insert failed:", (e as Error)?.message ?? e);
        }
      };

      // 1) Hard heuristic PED keyword block (before any LLM call)
      const qLower = question.toLowerCase();
      const pedTriggers = [
        "testosterone",
        "tren",
        "trenbolone",
        "anavar",
        "winstrol",
        "dianabol",
        "decadurabolin",
        "nandrolone",
        "clenbuterol",
        "steroid",
        "cycle ",
        "pct",
        "sarms",
        "mk-677",
        "rad-140",
        "lgd-4033",
        "ostarine",
        "cardarine",
      ];
      const isPedHeuristic = pedTriggers.some((t) => qLower.includes(t));
      if (isPedHeuristic) {
        const blocked: SingleAgentBlockedResponse = { blocked: true, reason: "ped" };
        await logStepBestEffort({
          status: "ok",
          latencyMs: elapsedMs(startedAll),
          input: { question },
          output: { blocked, raw: "heuristic_ped_block" },
          error: null,
        });
        await logRunBestEffort({
          query: question,
          response: blocked,
          latency_ms: elapsedMs(startedAll),
          cached: false,
          blocked: true,
          block_reason: "ped",
        });
        send("final", { type: "final", data: blocked });
        controller.close();
        return;
      }

      // 2) Cache lookup (best-effort). Cache key: topic:<normalized_user_topic>
      const topicKey = normalizeTopic(question);
      const cacheKey = `topic:${topicKey}`;
      let cachedResponse: SingleAgentResponse | null = null;
      let wasCacheHit = false;

      try {
        if (supabaseUrl && serviceRoleKey && topicKey) {
          const nowIso = new Date().toISOString();
          const rows = await fetchSupabaseRows({
            supabaseUrl,
            serviceRoleKey,
            pathAndQuery:
              `research_cache?cache_key=eq.${encodeURIComponent(cacheKey)}` +
              `&expires_at=gt.${encodeURIComponent(nowIso)}` +
              `&select=evidence,hit_count` +
              `&limit=1`,
          });
          if (Array.isArray(rows) && rows[0]) {
            const row = rows[0] as any;
            const evidence = row.evidence ?? null;
            cachedResponse = coerceSingleAgentResponse(evidence);
            wasCacheHit = cachedResponse !== null;

            // bump hit_count best-effort
            try {
              const patchUrl =
                `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/research_cache?cache_key=eq.${encodeURIComponent(cacheKey)}`;
              await fetch(patchUrl, {
                method: "PATCH",
                headers: {
                  apikey: serviceRoleKey,
                  Authorization: `Bearer ${serviceRoleKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ hit_count: (row.hit_count ?? 0) + 1 }),
              }).catch(() => {});
            } catch {
              // ignore
            }
          }
        }
      } catch (e) {
        console.log("research_cache lookup failed:", (e as Error)?.message ?? e);
      }

      // Only cache successful responses, and we only serve cache hits that are non-blocked.
      if (cachedResponse && cachedResponse.blocked === false) {
        await logStepBestEffort({
          status: "ok",
          latencyMs: elapsedMs(startedAll),
          input: { question },
          output: { cached: true, cache_key: cacheKey, evidence: cachedResponse },
          error: null,
        });
        await logRunBestEffort({
          query: question,
          response: cachedResponse,
          latency_ms: elapsedMs(startedAll),
          cached: true,
          blocked: false,
          block_reason: null,
        });
        // "Redesigned" payload on cache hits: keep response schema intact under `data`,
        // but add explicit cache metadata for the client to vary UI as needed.
        send("final", {
          type: "final",
          data: cachedResponse,
          meta: { cached: true, cache_key: cacheKey, cache_hit: wasCacheHit },
        });
        controller.close();
        return;
      }

      const attemptSingleAgent = async (): Promise<{
        rawText: string;
        parsed: SingleAgentResponse;
      }> => {
        const rawText = await anthropicMessageText({
          apiKey,
          model,
          system: SINGLE_AGENT_SYSTEM_PROMPT,
          user: question,
          maxTokens: 1400,
          temperature: 0.2,
        });
        const jsonText = extractFirstJsonValue(rawText);
        const parsedUnknown = jsonText ? safeJsonParse(sanitizeJson(jsonText)) : undefined;
        if (looksLikeBlockedResponse(parsedUnknown)) return { rawText, parsed: parsedUnknown };
        if (looksLikeOkResponse(parsedUnknown)) return { rawText, parsed: parsedUnknown };
        throw new Error("LLM response was not valid JSON for the required schema.");
      };

      // 3) Single Claude API call (retry once on invalid JSON)
      const startedAgent = Date.now();
      let rawText: string | null = null;
      let parsed: SingleAgentResponse | null = null;
      let stepError: string | null = null;

      try {
        const a1 = await attemptSingleAgent();
        rawText = a1.rawText;
        parsed = a1.parsed;
      } catch {
        try {
          const a2 = await attemptSingleAgent();
          rawText = a2.rawText;
          parsed = a2.parsed;
        } catch (e2) {
          stepError = (e2 as Error)?.message ?? String(e2);
        }
      }

      await logStepBestEffort({
        status: stepError ? "error" : "ok",
        latencyMs: elapsedMs(startedAgent),
        input: { question },
        output: rawText,
        error: stepError,
      });

      if (stepError || !parsed) {
        await logRunBestEffort({
          query: question,
          response: null,
          latency_ms: elapsedMs(startedAll),
          cached: false,
          blocked: false,
          block_reason: null,
        });
        send("error", { type: "error", message: stepError || "Unknown error" });
        controller.close();
        return;
      }

      const blocked = parsed.blocked === true;
      const blockReason = blocked ? (parsed as SingleAgentBlockedResponse).reason : null;

      // Cache only on successful, non-blocked responses. TTL: 7 days.
      if (!blocked) {
        try {
          if (supabaseUrl && serviceRoleKey && topicKey) {
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            await upsertSupabaseRow({
              supabaseUrl,
              serviceRoleKey,
              table: "research_cache",
              onConflict: "cache_key",
              row: {
                cache_key: cacheKey,
                topic: topicKey,
                subdomain: null,
                evidence: parsed,
                practical: null,
                limitations: null,
                ranked_sources: null,
                expires_at: expiresAt,
              },
            });
          }
        } catch (e) {
          console.log("research_cache upsert failed:", (e as Error)?.message ?? e);
        }
      }

      await logRunBestEffort({
        query: question,
        response: parsed,
        latency_ms: elapsedMs(startedAll),
        cached: false,
        blocked,
        block_reason: blockReason,
      });

      // 4) SSE final
      send("final", { type: "final", data: parsed });
      controller.close();
    },
  });

  return sseResponse(stream);
});
