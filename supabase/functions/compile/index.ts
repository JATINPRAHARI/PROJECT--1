// Aether Compiler edge function — runs an AI-driven compiler pipeline over a
// natural-language product requirement and streams stage events to the client
// via Server-Sent Events. Each stage produces a structured, validated artifact.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_BASE_URL = Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";

type Stage = {
  id: string;
  name: string;
  system: string;
  prompt: (ctx: Ctx) => string;
  schema: Record<string, unknown>;
  artifactKey: string;
};

type Ctx = {
  requirement: string;
  target: { frontend: string; backend: string };
  artifacts: Record<string, unknown>;
};

// JSON Schemas for each stage — these are the "typed contracts" between stages.
const irSchema = {
  type: "object",
  additionalProperties: false,
  required: ["product", "entities", "screens", "endpoints", "infrastructure"],
  properties: {
    product: {
      type: "object",
      required: ["name", "summary", "domain"],
      properties: {
        name: { type: "string" },
        summary: { type: "string" },
        domain: { type: "string" },
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "fields"],
        properties: {
          name: { type: "string" },
          fields: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "type"],
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: ["string", "number", "boolean", "uuid", "timestamp", "json"] },
                nullable: { type: "boolean" },
              },
            },
          },
        },
      },
    },
    screens: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "purpose"],
        properties: {
          name: { type: "string" },
          purpose: { type: "string" },
          components: { type: "array", items: { type: "string" } },
        },
      },
    },
    endpoints: {
      type: "array",
      items: {
        type: "object",
        required: ["method", "path", "purpose"],
        properties: {
          method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
          path: { type: "string" },
          purpose: { type: "string" },
        },
      },
    },
    infrastructure: {
      type: "object",
      required: ["frontend", "backend", "database"],
      properties: {
        frontend: { type: "string" },
        backend: { type: "string" },
        database: { type: "string" },
        auth: { type: "string" },
      },
    },
  },
};

const validationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passed", "checks", "issues", "coverage"],
  properties: {
    passed: { type: "boolean" },
    coverage: { type: "number", description: "0-100 requirement coverage" },
    integrity: { type: "number", description: "0-100 structural integrity" },
    checks: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "status"],
        properties: {
          name: { type: "string" },
          status: { type: "string", enum: ["pass", "warn", "fail"] },
          detail: { type: "string" },
        },
      },
    },
    issues: { type: "array", items: { type: "string" } },
  },
};

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nodes", "edges", "buildOrder"],
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "kind", "label"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["screen", "component", "hook", "endpoint", "model", "service", "infra"] },
          label: { type: "string" },
          target: { type: "string", enum: ["react-native", "node", "shared"] },
        },
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        required: ["from", "to"],
        properties: { from: { type: "string" }, to: { type: "string" }, kind: { type: "string" } },
      },
    },
    buildOrder: { type: "array", items: { type: "string" } },
  },
};

const codeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["files"],
  properties: {
    files: {
      type: "array",
      items: {
        type: "object",
        required: ["path", "language", "content", "target"],
        properties: {
          path: { type: "string" },
          language: { type: "string" },
          content: { type: "string" },
          target: { type: "string", enum: ["react-native", "node"] },
        },
      },
    },
  },
};

const testSchema = {
  type: "object",
  additionalProperties: false,
  required: ["results", "passed", "failed"],
  properties: {
    passed: { type: "number" },
    failed: { type: "number" },
    results: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "status"],
        properties: {
          name: { type: "string" },
          status: { type: "string", enum: ["pass", "fail"] },
          file: { type: "string" },
          error: { type: "string" },
        },
      },
    },
  },
};

const repairSchema = {
  type: "object",
  additionalProperties: false,
  required: ["actions", "patchedFiles"],
  properties: {
    actions: { type: "array", items: { type: "string" } },
    patchedFiles: {
      type: "array",
      items: {
        type: "object",
        required: ["path", "reason"],
        properties: { path: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
};

const deploySchema = {
  type: "object",
  additionalProperties: false,
  required: ["artifactId", "frontend", "backend", "status"],
  properties: {
    artifactId: { type: "string" },
    frontend: {
      type: "object",
      required: ["bundle", "platforms"],
      properties: {
        bundle: { type: "string" },
        platforms: { type: "array", items: { type: "string" } },
      },
    },
    backend: {
      type: "object",
      required: ["url", "runtime"],
      properties: { url: { type: "string" }, runtime: { type: "string" } },
    },
    status: { type: "string", enum: ["staged", "production"] },
  },
};

const STAGES: Stage[] = [
  {
    id: "parse",
    name: "Parse / Tokenize",
    artifactKey: "tokens",
    system: "You are the lexer of an AI compiler. Extract tokens from a natural-language product spec.",
    prompt: (c) =>
      `Extract structured tokens (nouns, verbs, constraints, non-functional requirements) from this requirement. Return JSON with shape {tokens: [{type, value}]}.\n\nREQUIREMENT:\n${c.requirement}`,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["tokens"],
      properties: {
        tokens: {
          type: "array",
          items: {
            type: "object",
            required: ["type", "value"],
            properties: {
              type: { type: "string", enum: ["entity", "action", "constraint", "nfr", "actor", "ui-element"] },
              value: { type: "string" },
            },
          },
        },
      },
    },
  },
  {
    id: "ir",
    name: "IR Generation",
    artifactKey: "ir",
    system:
      "You are the IR (Intermediate Representation) generator of an AI compiler. Lift natural language into a deterministic, typed spec.",
    prompt: (c) =>
      `Generate a complete Intermediate Representation for this product. Targets: frontend=${c.target.frontend}, backend=${c.target.backend}. Be precise; do not invent features not implied by the requirement.\n\nREQUIREMENT:\n${c.requirement}\n\nTOKENS:\n${JSON.stringify(c.artifacts.tokens)}`,
    schema: irSchema,
  },
  {
    id: "validate",
    name: "Schema Validation",
    artifactKey: "validation",
    system: "You are the validator stage. Verify the IR against requirement coverage and structural integrity.",
    prompt: (c) =>
      `Validate this IR. Check that every requirement is covered, entities are well-typed, and endpoints map to entities. Report coverage 0-100, integrity 0-100, list checks and any issues.\n\nIR:\n${JSON.stringify(c.artifacts.ir)}\n\nREQUIREMENT:\n${c.requirement}`,
    schema: validationSchema,
  },
  {
    id: "plan",
    name: "Build Graph Plan",
    artifactKey: "plan",
    system: "You are the dependency planner. Produce a build graph with topologically-ordered nodes.",
    prompt: (c) =>
      `Produce a dependency graph for building this app. Each node is a screen/component/hook/endpoint/model/service/infra unit. Edges express depends-on. Provide a topological buildOrder. Targets: ${c.target.frontend} (mobile) and ${c.target.backend} (server).\n\nIR:\n${JSON.stringify(c.artifacts.ir)}`,
    schema: planSchema,
  },
  {
    id: "generate",
    name: "Code Synthesis",
    artifactKey: "code",
    system:
      "You are the code generator. Emit production-ready React Native + Node.js code aligned with the IR and plan.",
    prompt: (c) =>
      `Generate the most important 4-6 files for this app: at least one React Native screen, one shared type module, one Node.js Express route, and one data model. Use idiomatic, typed TypeScript. Keep each file under 80 lines and self-contained.\n\nIR:\n${JSON.stringify(c.artifacts.ir)}\n\nPLAN:\n${JSON.stringify(c.artifacts.plan)}`,
    schema: codeSchema,
  },
  {
    id: "execute",
    name: "Execute & Test",
    artifactKey: "tests",
    system: "You are the runtime executor. Simulate test execution for the generated files.",
    prompt: (c) =>
      `Given these generated files, produce realistic unit/integration test results. Include 4-7 test names tied to the files. Most should pass; include 0-1 fail for realism.\n\nFILES:\n${JSON.stringify((c.artifacts.code as { files: { path: string }[] }).files.map((f) => f.path))}`,
    schema: testSchema,
  },
  {
    id: "repair",
    name: "Self-Repair",
    artifactKey: "repair",
    system: "You are the self-repair agent. Propose minimal patches for failing tests.",
    prompt: (c) =>
      `Propose repair actions for any failing tests. If none failed, return actions=["no-op: all green"] and patchedFiles=[].\n\nTESTS:\n${JSON.stringify(c.artifacts.tests)}`,
    schema: repairSchema,
  },
  {
    id: "deploy",
    name: "Deployment",
    artifactKey: "deploy",
    system: "You are the deployment orchestrator. Emit a deployment manifest.",
    prompt: (c) =>
      `Emit a deployment manifest. Frontend = React Native (iOS + Android). Backend = Node.js. Choose a plausible staging URL using the product name. Status = staged.\n\nIR:\n${JSON.stringify((c.artifacts.ir as { product: { name: string } }).product)}`,
    schema: deploySchema,
  },
];

async function callGateway(stage: Stage, ctx: Ctx): Promise<unknown> {
  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: stage.system },
      { role: "user", content: stage.prompt(ctx) },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "emit_" + stage.id,
          description: "Emit the structured artifact for stage " + stage.id,
          parameters: stage.schema,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "emit_" + stage.id } },
  };

  const res = await fetch(OPENAI_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`gateway ${res.status}: ${txt.slice(0, 300)}`);
  }

  const json = await res.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("no tool_call in response");
  try {
    return JSON.parse(call.function.arguments);
  } catch {
    throw new Error("tool_call arguments not valid JSON");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let payload: { requirement?: string; target?: { frontend?: string; backend?: string } };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requirement = (payload.requirement ?? "").trim();
  if (requirement.length < 10) {
    return new Response(JSON.stringify({ error: "requirement too short (min 10 chars)" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ctx: Ctx = {
    requirement,
    target: {
      frontend: payload.target?.frontend ?? "react-native",
      backend: payload.target?.backend ?? "nodejs",
    },
    artifacts: {},
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const log = (level: string, msg: string) =>
        send("log", { level, msg, ts: new Date().toISOString() });

      try {
        send("run", { stages: STAGES.map((s) => ({ id: s.id, name: s.name })) });
        log("info", `Compiler session started. Target: ${ctx.target.frontend} + ${ctx.target.backend}.`);

        for (const stage of STAGES) {
          const startedAt = Date.now();
          send("stage", { id: stage.id, status: "running" });
          log("info", `[${stage.id}] ${stage.name} — invoking model...`);

          let artifact: unknown;
          try {
            artifact = await callGateway(stage, ctx);
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            log("error", `[${stage.id}] failed: ${errMsg}`);
            send("stage", { id: stage.id, status: "fail", error: errMsg });
            send("done", { ok: false, error: errMsg });
            controller.close();
            return;
          }

          ctx.artifacts[stage.artifactKey] = artifact;
          const elapsed = Date.now() - startedAt;
          log("success", `[${stage.id}] complete in ${elapsed}ms`);
          send("stage", {
            id: stage.id,
            status: "done",
            elapsedMs: elapsed,
            artifactKey: stage.artifactKey,
            artifact,
          });
        }

        send("done", { ok: true, artifacts: ctx.artifacts });
        controller.close();
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        send("done", { ok: false, error: errMsg });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
