import { useCallback, useRef, useState } from "react";

export type StageId = "parse" | "ir" | "validate" | "plan" | "generate" | "execute" | "repair" | "deploy";
export type StageStatus = "pending" | "running" | "done" | "fail";

export interface StageState {
  id: string;
  name: string;
  status: StageStatus;
  elapsedMs?: number;
  artifact?: unknown;
  error?: string;
}

export interface LogLine {
  level: "info" | "success" | "warn" | "error";
  msg: string;
  ts: string;
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compile`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function useCompiler() {
  const [stages, setStages] = useState<StageState[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = () => {
    setStages([]);
    setLogs([]);
    setDone(false);
    setActiveStageId(null);
  };

  const run = useCallback(async (requirement: string) => {
    if (running) return;
    reset();
    setRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
        },
        body: JSON.stringify({ requirement, target: { frontend: "react-native", backend: "nodejs" } }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        setLogs((l) => [...l, { level: "error", msg: `request failed: ${res.status} ${text.slice(0, 200)}`, ts: new Date().toISOString() }]);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let event = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          let data: any;
          try { data = JSON.parse(dataStr); } catch { continue; }

          if (event === "run") {
            setStages(data.stages.map((s: any) => ({ id: s.id, name: s.name, status: "pending" as StageStatus })));
          } else if (event === "stage") {
            setStages((prev) =>
              prev.map((s) =>
                s.id === data.id
                  ? { ...s, status: data.status, elapsedMs: data.elapsedMs, artifact: data.artifact ?? s.artifact, error: data.error }
                  : s,
              ),
            );
            if (data.status === "running") setActiveStageId(data.id);
            if (data.status === "done") setActiveStageId(data.id);
          } else if (event === "log") {
            setLogs((l) => [...l, data]);
          } else if (event === "done") {
            setDone(true);
            setRunning(false);
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLogs((l) => [...l, { level: "error", msg, ts: new Date().toISOString() }]);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [running]);

  const abort = () => abortRef.current?.abort();

  return { stages, logs, running, done, activeStageId, run, abort, setActiveStageId };
}
