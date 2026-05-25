import { IntentIRSchema, validateStrict } from "../schemas.mjs";

function pickDomain(text) {
  const t = text.toLowerCase();
  if (t.includes("crm") || t.includes("sales pipeline") || t.includes("leads")) return "crm";
  if (t.includes("shop") || t.includes("cart") || t.includes("checkout")) return "ecommerce";
  if (t.includes("internal tool") || t.includes("admin dashboard")) return "internal-tool";
  if (t.includes("blog") || t.includes("cms") || t.includes("content")) return "content";
  if (t.includes("saas") || t.includes("subscription")) return "saas";
  return "other";
}

function normalizeId(raw, fallback) {
  const cleaned = String(raw ?? "").trim().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/gi, "");
  const id = cleaned.length ? cleaned : fallback;
  return id.replace(/^[^a-z]/i, "x-$&").toLowerCase();
}

function extractProductName(text) {
  const m = text.match(/(?:called|named)\s+["“”']?([a-z0-9 _-]{3,40})["“”']?/i);
  if (m?.[1]) return m[1].trim();
  return "Generated App";
}

function inferEntities(text) {
  const t = text.toLowerCase();
  const entities = [];
  const add = (name, fields) => {
    entities.push({ name, fields: fields.map((f) => ({ name: f, type: "string", required: false })) });
  };

  if (t.includes("task") || t.includes("todo")) add("task", ["title", "status", "assignee"]);
  if (t.includes("customer") || t.includes("client")) add("customer", ["name", "email"]);
  if (t.includes("invoice")) add("invoice", ["number", "amount", "status"]);
  if (t.includes("ticket") || t.includes("support")) add("ticket", ["title", "priority", "status"]);

  if (entities.length === 0) add("item", ["name", "status"]);
  return entities;
}

function inferRoles(text) {
  const t = text.toLowerCase();
  const roles = new Set(["admin"]);
  if (t.includes("manager")) roles.add("manager");
  if (t.includes("agent")) roles.add("agent");
  if (t.includes("user") || t.includes("member")) roles.add("user");
  if (t.includes("viewer") || t.includes("read-only")) roles.add("viewer");
  return Array.from(roles);
}

function inferScreens(entities) {
  const screens = [{ name: "dashboard", kind: "dashboard" }];
  for (const e of entities) {
    screens.push({ name: `${e.name}-list`, kind: "list", entity: e.name });
    screens.push({ name: `${e.name}-create`, kind: "create", entity: e.name });
  }
  return screens;
}

export function stageIntentExtraction(promptText) {
  const productName = extractProductName(promptText);
  const roles = inferRoles(promptText).map((r) => normalizeId(r, "user"));
  const entities = inferEntities(promptText).map((e) => ({
    name: normalizeId(e.name, "item"),
    fields: e.fields.map((f) => ({ ...f, name: normalizeId(f.name, "field") })),
  }));
  const screens = inferScreens(entities).map((s) => ({
    name: normalizeId(s.name, "screen"),
    kind: s.kind,
    entity: s.entity ? normalizeId(s.entity, "item") : undefined,
  }));

  const clarificationQuestions = [];
  if (!/auth|login|role/i.test(promptText)) {
    clarificationQuestions.push("Do you want authentication/roles, or should the app be public?");
  }
  if (!/db|database|persist/i.test(promptText)) {
    clarificationQuestions.push("Should data be persisted (database) or is in-memory OK for now?");
  }

  const intent = {
    productName,
    oneLiner: promptText.trim().slice(0, 140) || "Generated application",
    domain: pickDomain(promptText),
    roles,
    entities,
    screens,
    constraints: [],
    assumptions: [
      "If unspecified, generate basic CRUD flows.",
      "If unspecified, default role is 'admin'.",
      "If unspecified, fields are optional strings.",
    ],
    clarificationQuestions,
  };

  const validated = validateStrict(IntentIRSchema, intent);
  return validated.ok ? { ok: true, intent: validated.value } : { ok: false, intent, errors: validated.errors };
}

