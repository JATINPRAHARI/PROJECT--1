import { z } from "zod";

const Id = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_-]*$/i, "id must be alphanumeric/[_-] and start with a letter");

export const IntentIRSchema = z
  .object({
    productName: z.string().min(1),
    oneLiner: z.string().min(1),
    domain: z.enum(["crm", "ecommerce", "saas", "internal-tool", "content", "other"]).default("other"),
    roles: z.array(Id).min(1),
    entities: z.array(
      z.object({
        name: Id,
        fields: z.array(
          z.object({
            name: Id,
            type: z.enum(["string", "number", "boolean", "date", "enum", "text"]).default("string"),
            required: z.boolean().default(false),
          }),
        ),
      }),
    ),
    screens: z.array(
      z.object({
        name: Id,
        kind: z.enum(["list", "detail", "create", "dashboard"]).default("dashboard"),
        entity: Id.optional(),
      }),
    ),
    constraints: z.array(z.string()).default([]),
    assumptions: z.array(z.string()).default([]),
    clarificationQuestions: z.array(z.string()).default([]),
  })
  .strict();

export const DesignIRSchema = z
  .object({
    productName: z.string().min(1),
    roles: z.array(Id).min(1),
    entities: z.array(
      z.object({
        name: Id,
        primaryKey: z.literal("id").default("id"),
        fields: z.array(
          z.object({
            name: Id,
            type: z.enum(["string", "number", "boolean", "date", "enum", "text"]),
            required: z.boolean(),
          }),
        ),
      }),
    ),
    flows: z.array(
      z.object({
        name: Id,
        steps: z.array(z.string().min(1)).min(1),
        rolesAllowed: z.array(Id).min(1),
      }),
    ),
    policies: z.object({
      defaultRole: Id,
      accessModel: z.enum(["rbac"]).default("rbac"),
    }),
    assumptions: z.array(z.string()).default([]),
    clarificationQuestions: z.array(z.string()).default([]),
  })
  .strict();

export const AppSchemaSchema = z
  .object({
    ui: z.object({
      screens: z.array(
        z.object({
          id: Id,
          title: z.string().min(1),
          kind: z.enum(["list", "detail", "create", "dashboard"]),
          entity: Id.optional(),
          fields: z.array(Id).default([]),
          submitToApi: Id.optional(),
        }),
      ),
    }),
    api: z.object({
      endpoints: z.array(
        z.object({
          id: Id,
          method: z.enum(["GET", "POST", "PUT", "DELETE"]),
          path: z.string().min(1),
          entity: Id.optional(),
          action: z.enum(["list", "get", "create", "update", "delete"]),
          inputFields: z.array(Id).default([]),
          outputFields: z.array(Id).default([]),
          rolesAllowed: z.array(Id).min(1),
        }),
      ),
    }),
    db: z.object({
      entities: z.array(
        z.object({
          name: Id,
          fields: z.array(
            z.object({
              name: Id,
              type: z.enum(["string", "number", "boolean", "date", "enum", "text"]),
              required: z.boolean(),
            }),
          ),
        }),
      ),
    }),
    auth: z.object({
      roles: z.array(Id).min(1),
      defaultRole: Id,
    }),
    assumptions: z.array(z.string()).default([]),
    clarificationQuestions: z.array(z.string()).default([]),
  })
  .strict();

export const BundleSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.string().min(1),
    intent: IntentIRSchema,
    design: DesignIRSchema,
    schema: AppSchemaSchema,
    diagnostics: z.object({
      validationErrors: z.array(z.string()).default([]),
      repairsApplied: z.array(z.string()).default([]),
      failureTypes: z.array(z.string()).default([]),
    }),
  })
  .strict();

export const PatchSchema = z
  .object({
    version: z.literal(1),
    patchText: z.string().min(1),
    ops: z.array(
      z.discriminatedUnion("op", [
        z.object({
          op: z.literal("add_role"),
          role: Id,
        }),
        z.object({
          op: z.literal("add_entity"),
          entity: Id,
          fields: z.array(
            z.object({
              name: Id,
              type: z.enum(["string", "number", "boolean", "date", "enum", "text"]).default("string"),
              required: z.boolean().default(false),
            }),
          ),
        }),
        z.object({
          op: z.literal("remove_entity"),
          entity: Id,
        }),
        z.object({
          op: z.literal("add_field"),
          entity: Id,
          field: z.object({
            name: Id,
            type: z.enum(["string", "number", "boolean", "date", "enum", "text"]).default("string"),
            required: z.boolean().default(false),
          }),
        }),
        z.object({
          op: z.literal("add_screen"),
          screen: z.object({
            id: Id,
            title: z.string().min(1),
            kind: z.enum(["list", "detail", "create", "dashboard"]),
            entity: Id.optional(),
          }),
        }),
      ]),
    ),
  })
  .strict();

export function validateStrict(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, value: result.data, errors: [] };
  const errors = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  return { ok: false, value, errors };
}
