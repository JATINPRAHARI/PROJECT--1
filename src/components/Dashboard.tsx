import { useEffect, useMemo, useRef, useState } from "react";
import { useCompiler, type StageState } from "@/hooks/use-compiler";

const DEFAULT_REQ = `Build a ride-sharing mobile dashboard for drivers using React Native. It needs real-time map integration showing pickup hotspots, earnings tracking per completed trip, a driver rating modal after each ride, and push notifications for nearby ride requests. The Node.js backend should expose endpoints for trip lifecycle (accept, start, complete), spatial queries for nearest rider, and earnings aggregation by day/week.`;

type TabId = "ir" | "graph" | "source" | "logs";

export function Dashboard() {
  const { stages, logs, running, done, activeStageId, run, setActiveStageId } = useCompiler();
  const [requirement, setRequirement] = useState(DEFAULT_REQ);
  const [tab, setTab] = useState<TabId>("ir");
  const logScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logScrollRef.current) logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
  }, [logs]);

  const activeStage = stages.find((s) => s.id === activeStageId) ?? null;
  const ir = stages.find((s) => s.id === "ir")?.artifact as any | undefined;
  const plan = stages.find((s) => s.id === "plan")?.artifact as any | undefined;
  const code = stages.find((s) => s.id === "generate")?.artifact as any | undefined;
  const validation = stages.find((s) => s.id === "validate")?.artifact as any | undefined;
  const deploy = stages.find((s) => s.id === "deploy")?.artifact as any | undefined;

  const status = running ? "RUNNING" : done ? "READY" : "SYSTEMS_READY";
  const statusColor = running ? "text-status-warning" : "text-status-success";

  return (
    <div className="min-h-screen bg-bg-base text-zinc-100 font-['Inter'] flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border-main flex items-center justify-between px-6 bg-bg-surface shrink-0">
        <div className="flex items-center gap-4">
          <div className="size-6 bg-brand-primary rounded-sm flex items-center justify-center">
            <div className="size-3 bg-bg-base rotate-45"></div>
          </div>
          <span className="font-semibold tracking-tight text-sm uppercase">
            Aether Compiler <span className="text-text-dim font-normal">v0.4.2</span>
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`size-2 rounded-full ${running ? "bg-status-warning animate-pulse" : "bg-status-success"}`}></div>
            <span className={`text-xs font-mono ${statusColor}`}>{status}</span>
          </div>
          <button
            onClick={() => run(requirement)}
            disabled={running || requirement.trim().length < 10}
            className="h-8 px-4 bg-brand-primary text-bg-base text-xs font-bold rounded uppercase hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {running ? "Compiling…" : "New Build"}
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar: Pipeline Rail */}
        <aside className="w-64 border-r border-border-main bg-bg-surface flex flex-col shrink-0">
          <div className="p-4 border-b border-border-main">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-4">Compiler Pipeline</h3>
            <nav className="space-y-1">
              {(stages.length > 0 ? stages : PLACEHOLDER_STAGES).map((s) => (
                <StageRow key={s.id} stage={s} active={s.id === activeStageId} onClick={() => setActiveStageId(s.id)} />
              ))}
            </nav>
          </div>
          <div className="mt-auto p-4 space-y-3">
            <div className="bg-bg-subtle rounded p-3 border border-border-main">
              <div className="text-[10px] font-bold text-text-dim uppercase mb-2">Stages Complete</div>
              <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden mb-1">
                <div
                  className="h-full bg-brand-secondary transition-all"
                  style={{ width: `${(stages.filter((s) => s.status === "done").length / Math.max(stages.length, 1)) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span>{stages.filter((s) => s.status === "done").length} / {stages.length || 8}</span>
                <span>{Math.round(stages.reduce((acc, s) => acc + (s.elapsedMs ?? 0), 0))}ms</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Central Workspace */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Prompt Input */}
          <div className="p-6 border-b border-border-main">
            <div className="max-w-4xl mx-auto">
              <div className="relative">
                <div className="absolute -top-3 left-4 bg-bg-base px-2 text-[10px] font-mono text-brand-primary uppercase z-10">
                  Requirements Input
                </div>
                <textarea
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                  disabled={running}
                  className="w-full h-28 bg-bg-surface border border-border-main rounded-lg p-4 pr-4 text-sm font-['JetBrains_Mono'] focus:outline-none focus:border-brand-primary/50 resize-none disabled:opacity-60"
                  placeholder="Describe your application features and logic..."
                />
              </div>
            </div>
          </div>

          {/* Artifact Tabs */}
          <div className="h-10 border-b border-border-main flex items-center px-4 gap-4 bg-bg-surface/50 shrink-0">
            <TabBtn id="ir" tab={tab} setTab={setTab} label="Intermediate Representation" />
            <TabBtn id="graph" tab={tab} setTab={setTab} label="Build Graph" />
            <TabBtn id="source" tab={tab} setTab={setTab} label="Generated Source" />
            <TabBtn id="logs" tab={tab} setTab={setTab} label="System Logs" />
            {activeStage && (
              <div className="ml-auto text-[10px] font-mono text-text-dim uppercase">
                stage:{activeStage.id}{activeStage.elapsedMs ? ` · ${activeStage.elapsedMs}ms` : ""}
              </div>
            )}
          </div>

          {/* Artifact body */}
          <div className="flex-1 overflow-hidden grid grid-cols-1 grid-rows-[1fr_auto]">
            <div className="overflow-auto">
              {tab === "ir" && <IrView ir={ir} validation={validation} />}
              {tab === "graph" && <GraphView plan={plan} />}
              {tab === "source" && <SourceView code={code} />}
              {tab === "logs" && <LogsView logs={logs} fullscreen />}
            </div>

            {tab !== "logs" && (
              <div className="h-40 border-t border-border-main bg-bg-surface flex flex-col font-['JetBrains_Mono'] shrink-0">
                <div className="px-4 py-2 border-b border-border-main flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest">System Logs</span>
                  <span className="text-[10px] text-text-dim uppercase">{logs.length} lines</span>
                </div>
                <div ref={logScrollRef} className="flex-1 overflow-auto p-4 text-[12px] space-y-1">
                  {logs.length === 0 ? (
                    <div className="text-text-dim">Awaiting compiler invocation…</div>
                  ) : (
                    logs.map((l, i) => <LogLine key={i} line={l} />)
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Deploy Panel */}
        <aside className="w-72 border-l border-border-main bg-bg-surface p-6 shrink-0 overflow-auto">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-6">Deployment Status</h3>

          <div className="space-y-6">
            <div className="p-4 rounded border border-border-main bg-bg-subtle">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-semibold">React Native + Node.js</span>
                <div className="px-2 py-0.5 rounded-full bg-zinc-800 text-[10px] border border-border-main uppercase">
                  {deploy ? "Staged" : "Idle"}
                </div>
              </div>
              <div className="text-[10px] font-mono text-text-dim mb-4 break-all min-h-[1em]">
                {deploy ? `URL: ${deploy.backend?.url ?? "—"}` : "URL: —"}
              </div>
              <button
                disabled={!done}
                className="w-full py-2 bg-zinc-800 border border-border-main rounded text-[10px] font-bold uppercase hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Deploy to Production
              </button>
            </div>

            <div>
              <h4 className="text-[10px] font-bold uppercase text-text-dim mb-3">Validation Metrics</h4>
              {validation ? (
                <div className="space-y-3">
                  <Metric label="Coverage" value={validation.coverage ?? 0} />
                  <Metric label="Integrity" value={validation.integrity ?? (validation.passed ? 95 : 60)} />
                  <div className="text-[10px] font-mono text-text-dim mt-2">
                    {validation.checks?.length ?? 0} checks · {validation.issues?.length ?? 0} issues
                  </div>
                </div>
              ) : (
                <div className="text-[10px] font-mono text-text-dim">Awaiting validation stage…</div>
              )}
            </div>

            <div>
              <h4 className="text-[10px] font-bold uppercase text-text-dim mb-3">Infrastructure Tags</h4>
              <div className="flex flex-wrap gap-2">
                <Tag>React Native</Tag>
                <Tag>Node.js 20</Tag>
                <Tag>TypeScript</Tag>
                {ir?.infrastructure?.database && <Tag>{ir.infrastructure.database}</Tag>}
                {ir?.infrastructure?.auth && <Tag>{ir.infrastructure.auth}</Tag>}
              </div>
            </div>

            {ir?.product && (
              <div>
                <h4 className="text-[10px] font-bold uppercase text-text-dim mb-2">Product</h4>
                <div className="text-sm font-semibold mb-1">{ir.product.name}</div>
                <div className="text-[11px] text-text-dim leading-relaxed">{ir.product.summary}</div>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

const PLACEHOLDER_STAGES: StageState[] = [
  { id: "parse", name: "Parse / Tokenize", status: "pending" },
  { id: "ir", name: "IR Generation", status: "pending" },
  { id: "validate", name: "Schema Validation", status: "pending" },
  { id: "plan", name: "Build Graph Plan", status: "pending" },
  { id: "generate", name: "Code Synthesis", status: "pending" },
  { id: "execute", name: "Execute & Test", status: "pending" },
  { id: "repair", name: "Self-Repair", status: "pending" },
  { id: "deploy", name: "Deployment", status: "pending" },
];

function StageRow({ stage, active, onClick }: { stage: StageState; active: boolean; onClick: () => void }) {
  const isRunning = stage.status === "running";
  const isDone = stage.status === "done";
  const isFail = stage.status === "fail";

  const dotColor = isFail
    ? "bg-status-error"
    : isDone
      ? "bg-brand-primary"
      : isRunning
        ? "bg-status-warning animate-pulse"
        : "bg-zinc-800";

  const wrapClass = active
    ? "bg-brand-primary/5 border border-brand-primary/20"
    : isDone || isRunning
      ? "bg-bg-subtle border border-transparent"
      : "border border-transparent";

  const labelClass = isDone || isRunning || active ? "text-zinc-100" : "text-text-dim";

  const meta = isFail ? "FAIL" : isDone ? `${stage.elapsedMs ?? 0}ms` : isRunning ? "…" : "";
  const metaColor = isFail
    ? "text-status-error"
    : isDone
      ? "text-brand-primary"
      : isRunning
        ? "text-status-warning"
        : "text-text-dim";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left cursor-pointer transition-colors hover:bg-bg-subtle ${wrapClass}`}
    >
      <div className={`size-2 rounded-full shrink-0 ${dotColor}`}></div>
      <span className={`text-sm font-medium truncate ${labelClass}`}>{stage.name}</span>
      <span className={`ml-auto text-[10px] font-mono ${metaColor}`}>{meta}</span>
    </button>
  );
}

function TabBtn({ id, tab, setTab, label }: { id: TabId; tab: TabId; setTab: (t: TabId) => void; label: string }) {
  const active = id === tab;
  return (
    <button
      onClick={() => setTab(id)}
      className={`text-[10px] font-bold uppercase h-full cursor-pointer transition-colors ${
        active ? "text-brand-primary border-b-2 border-brand-primary" : "text-text-dim hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function IrView({ ir, validation }: { ir: any; validation: any }) {
  if (!ir) {
    return (
      <div className="p-8 font-mono text-xs text-text-dim">
        // No IR yet. Click <span className="text-brand-primary">New Build</span> to begin compilation.
      </div>
    );
  }
  return (
    <div className="p-4 font-['JetBrains_Mono'] text-[12.5px] leading-relaxed">
      <pre className="text-zinc-200 whitespace-pre-wrap break-words">
        <JsonView value={ir} />
      </pre>
      {validation && (
        <div className="mt-6 border-t border-border-main pt-4">
          <div className="text-[10px] uppercase text-text-dim mb-2">Validation</div>
          <div className="space-y-1">
            {validation.checks?.map((c: any, i: number) => (
              <div key={i} className="flex gap-3 text-[11px]">
                <span
                  className={
                    c.status === "pass"
                      ? "text-status-success"
                      : c.status === "warn"
                        ? "text-status-warning"
                        : "text-status-error"
                  }
                >
                  {c.status.toUpperCase()}
                </span>
                <span className="text-zinc-300">{c.name}</span>
                {c.detail && <span className="text-text-dim">— {c.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GraphView({ plan }: { plan: any }) {
  if (!plan) {
    return <div className="p-8 font-mono text-xs text-text-dim">// Build graph not yet planned.</div>;
  }

  const nodes: { id: string; label: string; kind: string; target?: string }[] = plan.nodes ?? [];
  const edges: { from: string; to: string }[] = plan.edges ?? [];
  const order: string[] = plan.buildOrder ?? [];
  const layered = layerNodes(nodes, edges, order);

  const colW = 200;
  const rowH = 70;
  const padX = 24;
  const padY = 24;
  const width = padX * 2 + layered.length * colW;
  const height = padY * 2 + Math.max(...layered.map((l) => l.length), 1) * rowH;

  const pos = new Map<string, { x: number; y: number }>();
  layered.forEach((col, ci) => {
    col.forEach((n, ri) => {
      pos.set(n.id, { x: padX + ci * colW + 70, y: padY + ri * rowH + 20 });
    });
  });

  return (
    <div className="p-6 overflow-auto h-full bg-bg-base">
      <svg width={width} height={height} className="font-mono">
        {edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x + 70}
              y1={a.y + 10}
              x2={b.x - 70}
              y2={b.y + 10}
              stroke="#00f5ff"
              strokeOpacity={0.25}
              strokeWidth={1}
            />
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const fill = n.target === "node" ? "#7c3aed" : n.target === "react-native" ? "#00f5ff" : "#71717a";
          return (
            <g key={n.id} transform={`translate(${p.x - 70}, ${p.y - 14})`}>
              <rect width="140" height="44" rx="4" fill="#121214" stroke={fill} strokeOpacity={0.5} />
              <text x="8" y="16" fill={fill} fontSize="9" fontFamily="JetBrains Mono">
                {n.kind.toUpperCase()}
              </text>
              <text x="8" y="32" fill="#fafafa" fontSize="11" fontFamily="JetBrains Mono">
                {trunc(n.label, 18)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-6 text-[11px] font-mono">
        <div className="text-text-dim uppercase mb-2">Build Order</div>
        <div className="flex flex-wrap gap-1">
          {order.map((id, i) => (
            <span key={i} className="px-2 py-0.5 bg-bg-subtle border border-border-main rounded text-zinc-300">
              {i + 1}. {nodes.find((n) => n.id === id)?.label ?? id}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SourceView({ code }: { code: any }) {
  const [active, setActive] = useState(0);
  if (!code?.files?.length) {
    return <div className="p-8 font-mono text-xs text-text-dim">// No source files generated yet.</div>;
  }
  const files = code.files;
  const file = files[Math.min(active, files.length - 1)];
  return (
    <div className="h-full flex">
      <div className="w-64 border-r border-border-main bg-bg-surface/30 overflow-auto shrink-0">
        {files.map((f: any, i: number) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`w-full text-left px-3 py-2 text-[11px] font-mono truncate cursor-pointer transition-colors ${
              i === active ? "bg-bg-subtle text-brand-primary" : "text-zinc-300 hover:bg-bg-subtle"
            }`}
          >
            <span className="text-text-dim mr-2">{f.target === "node" ? "srv" : "mob"}</span>
            {f.path}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="p-4 text-[12px] font-['JetBrains_Mono'] leading-relaxed text-zinc-200 whitespace-pre">
{file.content}
        </pre>
      </div>
    </div>
  );
}

function LogsView({ logs, fullscreen }: { logs: { level: string; msg: string; ts: string }[]; fullscreen?: boolean }) {
  return (
    <div className={`p-4 font-['JetBrains_Mono'] text-[12px] space-y-1 ${fullscreen ? "h-full" : ""}`}>
      {logs.length === 0 ? (
        <div className="text-text-dim">Awaiting compiler invocation…</div>
      ) : (
        logs.map((l, i) => <LogLine key={i} line={l} />)
      )}
    </div>
  );
}

function LogLine({ line }: { line: { level: string; msg: string; ts: string } }) {
  const color =
    line.level === "error"
      ? "text-status-error"
      : line.level === "warn"
        ? "text-status-warning"
        : line.level === "success"
          ? "text-status-success"
          : "text-brand-primary";
  const t = line.ts.slice(11, 19);
  return (
    <div className="flex gap-4">
      <span className="text-text-dim">[{t}]</span>
      <span className={color}>{line.level.toUpperCase()}</span>
      <span className="text-zinc-200">{line.msg}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped >= 90 ? "bg-status-success" : clamped >= 70 ? "bg-status-warning" : "bg-status-error";
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[11px]">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-200 font-mono">{clamped}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full ${color} transition-all`} style={{ width: `${clamped}%` }}></div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-1 bg-zinc-800 text-[9px] font-mono rounded text-zinc-300">{children}</span>;
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function layerNodes(
  nodes: { id: string }[],
  edges: { from: string; to: string }[],
  order: string[],
): { id: string; label: string; kind: string; target?: string }[][] {
  const deps = new Map<string, Set<string>>();
  nodes.forEach((n) => deps.set(n.id, new Set()));
  edges.forEach((e) => deps.get(e.to)?.add(e.from));

  const depth = new Map<string, number>();
  const compute = (id: string, seen = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const d = deps.get(id);
    if (!d || d.size === 0) {
      depth.set(id, 0);
      return 0;
    }
    let max = 0;
    for (const p of d) max = Math.max(max, compute(p, seen) + 1);
    depth.set(id, max);
    return max;
  };
  (order.length ? order : nodes.map((n) => n.id)).forEach((id) => compute(id));

  const layers: any[][] = [];
  nodes.forEach((n) => {
    const d = depth.get(n.id) ?? 0;
    (layers[d] ||= []).push(n);
  });
  return layers.map((l) => l ?? []);
}

function JsonView({ value, indent = 0 }: { value: unknown; indent?: number }) {
  return <span>{renderJson(value, indent)}</span>;
}

function renderJson(value: unknown, indent: number): React.ReactNode {
  const pad = "  ".repeat(indent);
  const padInner = "  ".repeat(indent + 1);
  if (value === null) return <span className="text-status-warning">null</span>;
  if (typeof value === "string") return <span className="text-status-warning">"{value}"</span>;
  if (typeof value === "number") return <span className="text-brand-secondary">{value}</span>;
  if (typeof value === "boolean") return <span className="text-status-success">{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>;
    return (
      <>
        [
        {value.map((v, i) => (
          <span key={i}>
            {"\n"}
            {padInner}
            {renderJson(v, indent + 1)}
            {i < value.length - 1 ? "," : ""}
          </span>
        ))}
        {"\n"}
        {pad}]
      </>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span>{"{}"}</span>;
    return (
      <>
        {"{"}
        {entries.map(([k, v], i) => (
          <span key={k}>
            {"\n"}
            {padInner}
            <span className="text-brand-primary">"{k}"</span>: {renderJson(v, indent + 1)}
            {i < entries.length - 1 ? "," : ""}
          </span>
        ))}
        {"\n"}
        {pad}
        {"}"}
      </>
    );
  }
  return <span>{String(value)}</span>;
}
