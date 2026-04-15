export type AskSseEvent =
  | { event: "stage"; data: any }
  | { event: "final"; data: any }
  | { event: "error"; data: any };

export function ask(
  question: string,
  opts?: {
    signal?: AbortSignal;
    onEvent?: (evt: AskSseEvent) => void;
  },
): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL");
  }
  if (!anonKey) {
    throw new Error("Missing VITE_SUPABASE_ANON_KEY");
  }

  const url = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/ask`;

  const onEvent = opts?.onEvent;

  return (async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ question }),
      signal: opts?.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ask() failed (${res.status}): ${text || res.statusText}`);
    }
    if (!res.body) throw new Error("ask() response had no body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent: string | null = null;

    const emit = (event: string | null, dataLine: string) => {
      if (!event) return;
      const trimmed = dataLine.trim();
      if (!trimmed) return;
      let data: any = trimmed;
      try {
        data = JSON.parse(trimmed);
      } catch {
        // keep as string
      }
      onEvent?.({ event: event as any, data });
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = chunk.split("\n");
        currentEvent = null;
        for (const line of lines) {
          if (line.startsWith("event:")) currentEvent = line.slice("event:".length).trim();
          if (line.startsWith("data:")) emit(currentEvent, line.slice("data:".length));
        }
      }
    }
  })();
}

