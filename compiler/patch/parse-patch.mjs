import { PatchSchema, validateStrict } from "../schemas.mjs";

function normalizeId(raw, fallback) {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/gi, "");
  const id = cleaned.length ? cleaned : fallback;
  return id.replace(/^[^a-z]/i, "x-$&").toLowerCase();
}

function parseFieldList(text) {
  const parts = text
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((p) => {
    // "amount:number!" or "status" etc.
    const m = p.match(/^([a-z0-9 _-]+)(?::(string|number|boolean|date|enum|text))?(!)?$/i);
    if (!m) return { name: normalizeId(p, "field"), type: "string", required: false };
    return {
      name: normalizeId(m[1], "field"),
      type: (m[2]?.toLowerCase() ?? "string"),
      required: !!m[3],
    };
  });
}

export function parsePatch(patchText) {
  const ops = [];
  const lines = patchText
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // add role X
    let m = line.match(/^add\s+role\s+(.+)$/i);
    if (m) {
      ops.push({ op: "add_role", role: normalizeId(m[1], "role") });
      continue;
    }

    // remove entity X
    m = line.match(/^remove\s+entity\s+(.+)$/i);
    if (m) {
      ops.push({ op: "remove_entity", entity: normalizeId(m[1], "entity") });
      continue;
    }

    // add entity X fields: a, b:number, c!
    m = line.match(/^add\s+entity\s+([a-z0-9 _-]+)(?:\s+fields?:\s*(.+))?$/i);
    if (m) {
      const entity = normalizeId(m[1], "entity");
      const fields = m[2] ? parseFieldList(m[2]) : [];
      ops.push({ op: "add_entity", entity, fields });
      continue;
    }

    // add field ENTITY.FIELD:type!
    m = line.match(/^add\s+field\s+([a-z0-9_-]+)\.([a-z0-9 _-]+)(?::(string|number|boolean|date|enum|text))?(!)?$/i);
    if (m) {
      ops.push({
        op: "add_field",
        entity: normalizeId(m[1], "entity"),
        field: { name: normalizeId(m[2], "field"), type: (m[3]?.toLowerCase() ?? "string"), required: !!m[4] },
      });
      continue;
    }

    // add screen id:title kind=list entity=invoice
    m = line.match(/^add\s+screen\s+([a-z0-9 _-]+)\s*:\s*(.+)$/i);
    if (m) {
      const id = normalizeId(m[1], "screen");
      const rest = m[2];
      const kindMatch = rest.match(/\bkind\s*=\s*(list|detail|create|dashboard)\b/i);
      const entityMatch = rest.match(/\bentity\s*=\s*([a-z0-9 _-]+)\b/i);
      const title = rest
        .replace(/\bkind\s*=\s*(list|detail|create|dashboard)\b/gi, "")
        .replace(/\bentity\s*=\s*([a-z0-9 _-]+)\b/gi, "")
        .trim();
      ops.push({
        op: "add_screen",
        screen: {
          id,
          title: title || id,
          kind: (kindMatch?.[1]?.toLowerCase() ?? "dashboard"),
          entity: entityMatch?.[1] ? normalizeId(entityMatch[1], "entity") : undefined,
        },
      });
      continue;
    }
  }

  const patch = { version: 1, patchText, ops };
  const validated = validateStrict(PatchSchema, patch);
  return validated.ok ? { ok: true, patch: validated.value } : { ok: false, patch, errors: validated.errors };
}

