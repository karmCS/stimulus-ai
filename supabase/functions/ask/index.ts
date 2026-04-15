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

type AgentState = {
  userQuery: string;
  fitnessGate?: unknown;
  intent?: unknown;
  plan?: unknown;
  sources?: unknown[];
  claims?: unknown[];
  beginnerQuestions?: string[];
  objections?: string[];
  draftAnswer?: unknown;
  finalAnswer?: unknown;
  safety?: unknown;
};

type AnswerVerdictLabel = "Foundational" | "High-value add-on" | "Optional" | "Low impact";

type FinalAnswer = {
  verdictLabel: AnswerVerdictLabel;
  oneLineVerdict: string;
  simpleExplanation: string;
  whatMattersMore: string[];
  whoShouldCare: string;
  bottomLine: string;
  followUps: string[];
  uncertainty: {
    level: "low" | "medium" | "high";
    notes: string[];
  };
  citations?: { label: string; url?: string }[];
};

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

function extractFirstJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenceMatch?.[1]?.trim() ?? trimmed).trim();

  if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;

  const start = candidate.indexOf("{");
  if (start === -1) return null;
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
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
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

async function callAgentJSON<T extends object>(opts: {
  apiKey: string;
  model: string;
  agentName: string;
  input: unknown;
  outputSchemaHint: string;
  instructions: string;
  temperature?: number;
}): Promise<{ output: T; rawText: string }> {
  const system =
    `You are ${opts.agentName}.\n` +
    `Single responsibility: ${opts.instructions}\n\n` +
    "Hard rules:\n" +
    "- Output MUST be valid JSON.\n" +
    "- Output ONLY JSON. No markdown. No preamble.\n" +
    "- Do NOT include chain-of-thought.\n" +
    "- Do NOT generate any final UI prose unless explicitly asked.\n\n" +
    "Output JSON schema (hint):\n" +
    opts.outputSchemaHint;

  const user = JSON.stringify(opts.input ?? {}, null, 2);
  const rawText = await anthropicMessageText({
    apiKey: opts.apiKey,
    model: opts.model,
    system,
    user,
    maxTokens: 900,
    temperature: opts.temperature ?? 0.2,
  });

  const jsonText = extractFirstJsonObject(rawText);
  const parsed = jsonText ? safeJsonParse(jsonText) : undefined;
  if (isRecord(parsed)) return { output: parsed as T, rawText };

  const repairSystem =
    `You are ${opts.agentName}.\n` +
    "Your previous output was not valid JSON.\n" +
    "Return ONLY valid JSON matching the schema. No markdown.\n\n" +
    "Schema (hint):\n" +
    opts.outputSchemaHint;
  const repairUser =
    "Fix the following into valid JSON only.\n\n" +
    rawText;
  const repaired = await anthropicMessageText({
    apiKey: opts.apiKey,
    model: opts.model,
    system: repairSystem,
    user: repairUser,
    maxTokens: 900,
    temperature: 0,
  });
  const repairedJsonText = extractFirstJsonObject(repaired);
  const repairedParsed = repairedJsonText ? safeJsonParse(repairedJsonText) : undefined;
  if (!isRecord(repairedParsed)) {
    throw new Error(`${opts.agentName} did not return valid JSON after repair`);
  }
  return { output: repairedParsed as T, rawText: repaired };
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
    throw new Error(`Supabase insert failed (${opts.table}) (${res.status}): ${text || res.statusText}`);
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
  const url = `${opts.supabaseUrl.replace(/\/+$/, "")}/rest/v1/${opts.table}?on_conflict=${encodeURIComponent(opts.onConflict)}`;
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
    throw new Error(`Supabase upsert failed (${opts.table}) (${res.status}): ${text || res.statusText}`);
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

  const state: AgentState = { userQuery: question };

  // Always respond via SSE for POST requests.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: "stage" | "final" | "error", data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Create run row (best-effort). If env missing, we still proceed and rely on function logs.
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

      async function logStep(step: {
    agentName: string;
    input: unknown;
    output?: unknown;
    status: "ok" | "error";
    latencyMs?: number;
    error?: string;
      }) {
        try {
          if (!supabaseUrl || !serviceRoleKey) return;
          await insertSupabaseRow({
            supabaseUrl,
            serviceRoleKey,
            table: "agent_steps",
            row: {
              run_id: runId,
              agent_name: step.agentName,
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
      }

      async function runAgent<T extends object>(args: Parameters<typeof callAgentJSON<T>>[0]) {
        send("stage", { runId, stage: args.agentName, status: "started" });
        const started = Date.now();
        try {
          const { output } = await callAgentJSON<T>(args);
          await logStep({
            agentName: args.agentName,
            input: args.input,
            output,
            status: "ok",
            latencyMs: elapsedMs(started),
          });
          send("stage", { runId, stage: args.agentName, status: "done" });
          return output;
        } catch (e) {
          await logStep({
            agentName: args.agentName,
            input: args.input,
            status: "error",
            latencyMs: elapsedMs(started),
            error: (e as Error)?.message ?? String(e),
          });
          send("stage", { runId, stage: args.agentName, status: "done" });
          throw e;
        }
      }

      try {
    // 1) FitnessGate
    const qLower = question.toLowerCase();
    const highRiskTriggers = [
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
    const isHighRiskHeuristic = highRiskTriggers.some((t) => qLower.includes(t));

    if (isHighRiskHeuristic) {
      const finalAnswer: FinalAnswer = {
        verdictLabel: "Foundational",
        oneLineVerdict: "I can’t help with PED/steroid cycles or instructions.",
        simpleExplanation:
          "That’s high-risk and can cause serious health harms. If your question is about training or nutrition instead, I can help with a safer, evidence-grounded plan.",
        whatMattersMore: ["Training consistency", "Sleep + recovery", "Nutrition fundamentals (protein + calories)"],
        whoShouldCare: "Anyone trying to make progress without taking unnecessary health risks.",
        bottomLine: "Ask a training/nutrition question and I’ll give a clear, prioritized answer.",
        followUps: ["What’s your goal (fat loss or muscle gain)?", "How many days/week can you train?", "What equipment do you have access to?"],
        uncertainty: { level: "low", notes: ["PED guidance is restricted by safety policy."] },
      };
      send("final", { runId, finalAnswer, debug: { risk_level: "high", heuristic: "ped_trigger" } });
      controller.close();
      return;
    }

    const fitnessGate = await runAgent<{
      allowed: boolean;
      domain: string;
      subdomain: string;
      risk_level: "low" | "medium" | "high";
      reason?: string;
    }>({
      apiKey,
      model,
      agentName: "FitnessGate",
      instructions:
        "Classify whether the query is fitness/nutrition related and assign risk level. Block PEDs, extreme dieting, medical diagnosis requests.",
      outputSchemaHint:
        '{ "allowed": true, "domain": "fitness", "subdomain": "supplements", "risk_level": "low", "reason": "optional short reason" }',
      input: { userQuery: question, heuristic: { ped_like: isHighRiskHeuristic } },
      temperature: 0,
    });
    state.fitnessGate = fitnessGate;

    // Update run row fields best-effort
    try {
      if (runId && supabaseUrl && serviceRoleKey) {
        const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/agent_runs?id=eq.${runId}`;
        await fetch(url, {
          method: "PATCH",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            allowed: fitnessGate.allowed,
            risk_level: fitnessGate.risk_level,
            domain: fitnessGate.domain,
            subdomain: fitnessGate.subdomain,
          }),
        }).catch(() => {});
      }
    } catch {
      // ignore
    }

        if (!fitnessGate.allowed) {
      const finalAnswer: FinalAnswer = {
        verdictLabel: "Foundational",
        oneLineVerdict: "I can only help with fitness, training, nutrition, supplements, recovery, and body composition.",
        simpleExplanation:
          "Try rephrasing your question into one of those topics. If this is a health or medical issue, it’s best to ask a qualified clinician.",
        whatMattersMore: ["Clear goal (fat loss vs muscle gain)", "Training plan basics", "Protein + sleep + consistency"],
        whoShouldCare: "Anyone training and trying to make progress safely.",
        bottomLine: "Ask a fitness-specific question and I’ll answer it in a simple, science-grounded way.",
        followUps: ["What’s your goal (fat loss or muscle gain)?", "What’s your training experience level?", "How many days/week do you train?"],
        uncertainty: { level: "low", notes: ["Out-of-scope query was blocked by the fitness gate."] },
      };
      state.finalAnswer = finalAnswer;
      try {
        if (runId && supabaseUrl && serviceRoleKey) {
          const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/agent_runs?id=eq.${runId}`;
          await fetch(url, {
            method: "PATCH",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ final_answer: finalAnswer }),
          }).catch(() => {});
        }
      } catch {
        // ignore
      }
          send("final", { runId, finalAnswer, debug: { risk_level: (fitnessGate as any).risk_level } });
          controller.close();
          return;
        }

    // 2) IntentParser
    const intent = await runAgent<{
      topic: string;
      intent: string;
      inferred_goals: string[];
      ambiguities: string[];
      subquestions: string[];
      personalization: { goal?: string; experience?: string; training_frequency?: string };
    }>({
      apiKey,
      model,
      agentName: "IntentParser",
      instructions: "Structure the user question into topic, intent, goals, ambiguities, and subquestions for research.",
      outputSchemaHint:
        '{ "topic": "creatine", "intent": "importance", "inferred_goals": ["muscle gain"], "ambiguities": ["user goal unclear"], "subquestions": ["Does creatine help strength?"], "personalization": { "goal": "muscle gain", "experience": "beginner", "training_frequency": "3x/week" } }',
      input: { userQuery: question, fitnessGate },
      temperature: 0.2,
    });
    state.intent = intent;

    // 3) Planner
    const plan = await runAgent<{
      research_plan: string[];
      evidence_threshold: "low" | "medium" | "high";
      answer_structure: string[];
      must_include: string[];
    }>({
      apiKey,
      model,
      agentName: "Planner",
      instructions:
        "Create a research plan and define what evidence is needed. Define answer structure following the mandatory UI sections.",
      outputSchemaHint:
        '{ "research_plan": ["Find strongest evidence", "Find practical relevance", "Find limitations"], "evidence_threshold": "medium", "answer_structure": ["Verdict", "Explanation", "What matters more", "Who should care", "Bottom line", "Follow-ups"], "must_include": ["uncertainty", "safety"] }',
      input: { userQuery: question, fitnessGate, intent },
      temperature: 0.2,
    });
    state.plan = plan;

    // 4) Research cache lookup (best-effort). If unavailable, fall back to running researchers.
    const topicKey = String((intent as any).topic ?? "").trim().toLowerCase();
    const subdomainKey = String((fitnessGate as any).subdomain ?? "").trim().toLowerCase();
    const cacheKey = `topic:${topicKey}|sub:${subdomainKey}`;

    type EvidenceOut = { findings: string[]; sources: { label: string; type: string; url?: string }[] };
    type PracticalOut = { findings: string[]; practical_notes: string[] };
    type LimitationsOut = { caveats: string[]; edge_cases: string[]; safety_flags: string[] };
    type RankedOut = { ranked_sources: { label: string; type: string; score: number; url?: string }[] };

    let evidence: EvidenceOut | null = null;
    let practical: PracticalOut | null = null;
    let limitations: LimitationsOut | null = null;
    let rankedSources: RankedOut | null = null;

    send("stage", { runId, stage: "ResearchCache", status: "started" });
    try {
      if (supabaseUrl && serviceRoleKey && topicKey) {
        const nowIso = new Date().toISOString();
        const rows = await fetchSupabaseRows({
          supabaseUrl,
          serviceRoleKey,
          pathAndQuery:
            `research_cache?cache_key=eq.${encodeURIComponent(cacheKey)}` +
            `&expires_at=gt.${encodeURIComponent(nowIso)}` +
            `&select=evidence,practical,limitations,ranked_sources,hit_count` +
            `&limit=1`,
        });
        if (Array.isArray(rows) && rows[0]) {
          const row = rows[0] as any;
          evidence = row.evidence ?? null;
          practical = row.practical ?? null;
          limitations = row.limitations ?? null;
          rankedSources = row.ranked_sources ? { ranked_sources: row.ranked_sources } : null;

          // bump hit_count best-effort
          try {
            const patchUrl = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/research_cache?cache_key=eq.${encodeURIComponent(cacheKey)}`;
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
    send("stage", { runId, stage: "ResearchCache", status: "done", summary: evidence ? "hit" : "miss" });

    if (!evidence || !practical || !limitations) {
      // 4) Parallel Researchers
      const out = await Promise.all([
        runAgent<EvidenceOut>({
          apiKey,
          model,
          agentName: "EvidenceResearcher",
          instructions:
            "Find the highest-quality evidence (meta-analyses, systematic reviews, position stands) relevant to the question. Output findings and sources.",
          outputSchemaHint:
            '{ "findings": ["Conservative evidence-based summary..."], "sources": [{ "label": "Author et al. (Year) Journal", "type": "meta-analysis", "url": "optional" }] }',
          input: { userQuery: question, intent, plan },
          temperature: 0.2,
        }),
        runAgent<PracticalOut>({
          apiKey,
          model,
          agentName: "PracticalContextResearcher",
          instructions:
            "Translate the question into real-world importance and prioritization (fundamentals > supplements). Return practical notes, not final prose.",
          outputSchemaHint:
            '{ "findings": ["What matters in practice..."], "practical_notes": ["Implementation note..."] }',
          input: { userQuery: question, intent, fitnessGate },
          temperature: 0.3,
        }),
        runAgent<LimitationsOut>({
          apiKey,
          model,
          agentName: "LimitationsResearcher",
          instructions:
            "List caveats, edge cases, and safety flags. Be conservative and explicit about uncertainty or mixed evidence.",
          outputSchemaHint:
            '{ "caveats": ["Evidence is mixed on..."], "edge_cases": ["If training status is..."], "safety_flags": ["Kidney disease is a contraindication for..."] }',
          input: { userQuery: question, intent, fitnessGate },
          temperature: 0.2,
        }),
      ]);
      evidence = out[0];
      practical = out[1];
      limitations = out[2];

      // 5) SourceRanker
      rankedSources = await runAgent<RankedOut>({
        apiKey,
        model,
        agentName: "SourceRanker",
        instructions:
          "Rank sources with priority: meta-analyses > systematic reviews > position stands > primary studies > reputable summaries. Output a ranked list with scores.",
        outputSchemaHint:
          '{ "ranked_sources": [{ "label": "Source", "type": "meta-analysis", "score": 0.92, "url": "optional" }] }',
        input: { sources: (evidence as any).sources ?? [], intent },
        temperature: 0,
      });

      // Upsert cache best-effort (TTL: 14 days)
      try {
        if (supabaseUrl && serviceRoleKey && topicKey) {
          const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
          await upsertSupabaseRow({
            supabaseUrl,
            serviceRoleKey,
            table: "research_cache",
            onConflict: "cache_key",
            row: {
              cache_key: cacheKey,
              topic: topicKey,
              subdomain: subdomainKey || null,
              evidence,
              practical,
              limitations,
              ranked_sources: rankedSources?.ranked_sources ?? null,
              expires_at: expiresAt,
            },
          });
        }
      } catch (e) {
        console.log("research_cache upsert failed:", (e as Error)?.message ?? e);
      }
    }

    state.sources = rankedSources?.ranked_sources ?? [];

    // 6) ClaimExtractor
    const claims = await runAgent<{
      claims: { claim: string; confidence: "low" | "medium" | "high"; source_labels: string[] }[];
    }>({
      apiKey,
      model,
      agentName: "ClaimExtractor",
      instructions:
        "Convert findings into atomic, conservatively worded claims. Each claim must cite source labels. No narrative.",
      outputSchemaHint:
        '{ "claims": [{ "claim": "Atomic claim...", "confidence": "medium", "source_labels": ["Author (Year)"] }] }',
      input: { evidence, practical, limitations, rankedSources, intent },
      temperature: 0.1,
    });
    state.claims = claims.claims;

    // 7) CitationVerifier
    const verifiedClaims = await runAgent<{
      verified_claims: { claim: string; confidence: "low" | "medium" | "high"; source_labels: string[]; notes?: string }[];
      removed_claims: { claim: string; reason: string }[];
    }>({
      apiKey,
      model,
      agentName: "CitationVerifier",
      instructions:
        "Ensure claims match sources. Remove unsupported claims and downgrade exaggerated wording. Keep only what can be defended.",
      outputSchemaHint:
        '{ "verified_claims": [{ "claim": "Claim", "confidence": "medium", "source_labels": ["Source"], "notes": "optional" }], "removed_claims": [{ "claim": "Claim", "reason": "why removed" }] }',
      input: { claims: claims.claims, ranked_sources: rankedSources?.ranked_sources ?? [] },
      temperature: 0,
    });
    state.claims = verifiedClaims.verified_claims;

    // 8) Parallel Reasoning (Novice + Skeptic)
    const [novice, skeptic] = await Promise.all([
      runAgent<{ beginner_questions: string[] }>({
        apiKey,
        model,
        agentName: "NoviceAgent",
        instructions:
          "Simulate a beginner reading the verified claims. Ask simple clarification questions and point out confusion risks.",
        outputSchemaHint: '{ "beginner_questions": ["Question 1", "Question 2"] }',
        input: { userQuery: question, verified_claims: verifiedClaims.verified_claims },
        temperature: 0.4,
      }),
      runAgent<{ objections: string[]; prioritization_push: string[] }>({
        apiKey,
        model,
        agentName: "SkepticAgent",
        instructions:
          "Challenge reasoning: detect overstatements, force prioritization, identify missing comparisons, and call out tradeoffs.",
        outputSchemaHint: '{ "objections": ["Objection 1"], "prioritization_push": ["What matters more: ..."] }',
        input: { userQuery: question, verified_claims: verifiedClaims.verified_claims, intent },
        temperature: 0.2,
      }),
    ]);
    state.beginnerQuestions = novice.beginner_questions;
    state.objections = skeptic.objections;

    // 9) TeacherWriter (structured explanation draft; still not final UI text)
    const draft = await runAgent<{
      verdictLabel: AnswerVerdictLabel;
      oneLineVerdict: string;
      simpleExplanation: string;
      whatMattersMore: string[];
      whoShouldCare: string;
      bottomLine: string;
      uncertainty: { level: "low" | "medium" | "high"; notes: string[] };
      citations_needed: boolean;
      citation_candidates: string[];
    }>({
      apiKey,
      model,
      agentName: "TeacherWriter",
      instructions:
        "Write the answer sections using ONLY verified claims. Be simple, decisive, and prioritized. Include uncertainty/tradeoffs. Do not add new facts.",
      outputSchemaHint:
        '{ "verdictLabel": "High-value add-on", "oneLineVerdict": "...", "simpleExplanation": "...", "whatMattersMore": ["..."], "whoShouldCare": "...", "bottomLine": "...", "uncertainty": { "level": "medium", "notes": ["..."] }, "citations_needed": true, "citation_candidates": ["Source label"] }',
      input: {
        userQuery: question,
        intent,
        verified_claims: verifiedClaims.verified_claims,
        skeptic,
        novice,
      },
      temperature: 0.4,
    });
    state.draftAnswer = draft;

    // 10) RewriterSimplifier
    const simplified = await runAgent<{
      oneLineVerdict: string;
      simpleExplanation: string;
      whatMattersMore: string[];
      whoShouldCare: string;
      bottomLine: string;
      followUps: string[];
    }>({
      apiKey,
      model,
      agentName: "RewriterSimplifier",
      instructions:
        "Make the drafted answer shorter, simpler, more memorable, more actionable. Keep meaning intact and avoid fluff.",
      outputSchemaHint:
        '{ "oneLineVerdict": "...", "simpleExplanation": "...", "whatMattersMore": ["..."], "whoShouldCare": "...", "bottomLine": "...", "followUps": ["..."] }',
      input: { draft, beginner_questions: novice.beginner_questions },
      temperature: 0.5,
    });

    // 11) SafetyPolicyAgent
    const safety = await runAgent<{
      allowed: boolean;
      modifications: string[];
      safety_notes: string[];
      final_overrides?: Partial<FinalAnswer>;
    }>({
      apiKey,
      model,
      agentName: "SafetyPolicyAgent",
      instructions:
        "Enforce fitness safety: block PED guidance, extreme dieting, injury misuse, and medical diagnosis. Modify unsafe sections and add safety notes as needed.",
      outputSchemaHint:
        '{ "allowed": true, "modifications": ["..."], "safety_notes": ["..."], "final_overrides": { "bottomLine": "optional override" } }',
      input: { userQuery: question, risk_level: (fitnessGate as any).risk_level, draft, simplified },
      temperature: 0,
    });
    state.safety = safety;

    if (!safety.allowed) {
      const finalAnswer: FinalAnswer = {
        verdictLabel: "Foundational",
        oneLineVerdict: "I can’t safely answer that request as asked.",
        simpleExplanation:
          "Some fitness topics can be high-risk (injury, extreme dieting, or medical concerns). If you reframe it toward safe training, recovery, or nutrition fundamentals, I can help.",
        whatMattersMore: ["Training basics", "Nutrition fundamentals", "Sleep + recovery"],
        whoShouldCare: "Anyone trying to train safely and make steady progress.",
        bottomLine: "Ask a safer, fitness-focused version of the question and I’ll answer clearly.",
        followUps: ["What’s your goal (fat loss or muscle gain)?", "Any injuries or pain right now?", "How many days/week can you train?"],
        uncertainty: { level: "low", notes: ["Safety policy blocked a high-risk request."] },
      };
      state.finalAnswer = finalAnswer;
      send("final", { runId, finalAnswer, debug: { risk_level: (fitnessGate as any).risk_level, safety_notes: safety.safety_notes } });
      controller.close();
      return;
    }

    // 12) ResponseFormatter (final UI-ready JSON)
    const formatted = await runAgent<FinalAnswer>({
      apiKey,
      model,
      agentName: "ResponseFormatter",
      instructions:
        "Produce the final UI-ready JSON in the mandatory answer structure. Use only the simplified text plus safety constraints. Add citations only if needed.",
      outputSchemaHint:
        '{ "verdictLabel": "High-value add-on", "oneLineVerdict": "...", "simpleExplanation": "...", "whatMattersMore": ["..."], "whoShouldCare": "...", "bottomLine": "...", "followUps": ["..."], "uncertainty": { "level": "medium", "notes": ["..."] }, "citations": [{ "label": "Source", "url": "optional" }] }',
      input: {
        verdictLabel: draft.verdictLabel,
        oneLineVerdict: simplified.oneLineVerdict,
        simpleExplanation: simplified.simpleExplanation,
        whatMattersMore: simplified.whatMattersMore,
        whoShouldCare: simplified.whoShouldCare,
        bottomLine: simplified.bottomLine,
        followUps: simplified.followUps,
        uncertainty: draft.uncertainty,
        citations_policy:
          "Include citations only when making specific numeric claims, strong recommendations, safety-sensitive claims, or contested claims. Otherwise omit citations.",
        ranked_sources: rankedSources?.ranked_sources ?? [],
        citation_candidates: draft.citation_candidates,
        safety,
      },
      temperature: 0.2,
    });

    // Apply safety overrides (if any)
    const finalAnswer: FinalAnswer = {
      ...formatted,
      ...(safety.final_overrides ?? {}),
    };
    state.finalAnswer = finalAnswer;

    // Persist final answer best-effort
    try {
      if (runId && supabaseUrl && serviceRoleKey) {
        const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/agent_runs?id=eq.${runId}`;
        await fetch(url, {
          method: "PATCH",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ final_answer: finalAnswer, debug: { risk_level: (fitnessGate as any).risk_level } }),
        }).catch(() => {});
      }
    } catch {
      // ignore
    }

        send("final", { runId, finalAnswer, debug: { risk_level: (fitnessGate as any).risk_level } });
        controller.close();
        return;
      } catch (err) {
        const message = (err as Error)?.message ?? String(err);
        console.log("Pipeline failed:", message);
        send("error", { runId, message });
        controller.close();
        return;
      }
    },
  });

  return sseResponse(stream);
});

