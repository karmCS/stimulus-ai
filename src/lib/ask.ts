export function ask(
  question: string,
  opts?: {
    signal?: AbortSignal;
  },
): ReadableStream<Uint8Array> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL");
  }
  if (!anonKey) {
    throw new Error("Missing VITE_SUPABASE_ANON_KEY");
  }

  const url = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/ask`;

  // Return a stream by bridging the fetch promise into a ReadableStream.
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
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

        if (!res.body) {
          throw new Error("ask() response had no body");
        }

        const reader = res.body.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

