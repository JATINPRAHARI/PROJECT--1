import { DesignIRSchema, validateStrict } from "../schemas.mjs";

export function stageSystemDesign(intent) {
  const entities = intent.entities.map((e) => ({
    name: e.name,
    primaryKey: "id",
    fields: [{ name: "id", type: "string", required: true }, ...e.fields.map((f) => ({ ...f, required: !!f.required }))],
  }));

  const flows = [];
  for (const e of entities) {
    flows.push({
      name: `${e.name}-crud`,
      steps: [`List ${e.name}`, `Create ${e.name}`, `View ${e.name}`, `Update ${e.name}`, `Delete ${e.name}`],
      rolesAllowed: intent.roles,
    });
  }

  const design = {
    productName: intent.productName,
    roles: intent.roles,
    entities,
    flows,
    policies: { defaultRole: intent.roles.includes("admin") ? "admin" : intent.roles[0], accessModel: "rbac" },
    assumptions: intent.assumptions,
    clarificationQuestions: intent.clarificationQuestions,
  };

  const validated = validateStrict(DesignIRSchema, design);
  return validated.ok ? { ok: true, design: validated.value } : { ok: false, design, errors: validated.errors };
}

