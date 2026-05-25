# Source Weaver "Compiler" System

This repo includes a **deterministic, multi-stage generation pipeline** that behaves like a compiler:

Natural language → structured IR → validated → refined/repair → executable bundle → runs via a runtime.

## Pipeline (mandatory stages)

1. **Intent Extraction** (`compiler/stages/intent.mjs`)
   - Input: natural language prompt
   - Output: `IntentIR` (strict JSON via `zod`)
   - Handles vague inputs by adding `clarificationQuestions` + documented `assumptions`

2. **System Design Layer** (`compiler/stages/design.mjs`)
   - Converts intent → architecture primitives (entities, flows, RBAC policy)
   - Output: `DesignIR` (strict JSON via `zod`)

3. **Schema Generation** (`compiler/stages/schema-gen.mjs`)
   - Generates **UI config**, **API config**, **DB schema**, **auth rules**
   - Output: `AppSchema` (strict JSON via `zod`)

4. **Refinement Layer** (`compiler/stages/refine.mjs`)
   - Resolves inconsistencies across layers (roles, missing targets, missing references)
   - Output: refined `AppSchema`

## Strict schema enforcement

All stage outputs are validated with `zod` schemas in `compiler/schemas.mjs`:
- Always valid JSON (objects are constructed in-process; written with `JSON.stringify`)
- Required keys enforced
- Unknown keys rejected (`.strict()`)
- Type safety enforced at runtime

## Validation + repair engine (core)

After refinement, the system runs:
- **Cross-layer validation** (`compiler/validate-cross-layer.mjs`)
  - API fields must exist in DB entity fields
  - UI fields must exist in referenced entity fields
  - UI submit targets must exist as API endpoints
  - Roles referenced must exist in `auth.roles`

Then a targeted **repair pass** runs (`compiler/repair/repair.mjs`):
- Fix missing required top-level fields
- Remove endpoints/screens referencing missing entities
- Fix invalid `auth.defaultRole`
- Never “blind full retry”; repairs are specific and recorded

Diagnostics are written to `diagnostics` in `bundle.json`:
- `validationErrors`
- `repairsApplied`
- `failureTypes` (e.g. `missing_keys`, `schema_mismatch`)

## Determinism

The current implementation is deterministic by design:
- No network calls
- No LLM sampling
- Intent extraction uses fixed heuristics
- Same input → same output

If you later swap Intent Extraction with an LLM, keep determinism by:
- Constrained IR schemas + strict validators
- Stage-by-stage regeneration (only redo the stage that failed)
- Deterministic decoding settings + stable templates

## Execution awareness (runnable runtime)

The “compiler” produces a **bundle** (`bundle.json`) that is directly executable by a runtime:
- Runtime: `compiler/runtime/server.mjs` (Node HTTP server)
- It renders UI screens and exposes API endpoints with RBAC.
- Storage adapters (`compiler/runtime/storage.mjs`):
  - `memory` (in-memory)
  - `file` (persistent JSON store in a data dir; default for `sw-run`)
  - `supabase` (optional; requires env vars)

Run:
- `node scripts/sw-run.mjs --bundle dist/compiler/bundle.json --port 8790 --storage file --dataDir .runtime-data`

## Failure handling

Underspecified prompts:
- The system proceeds with assumptions and outputs `clarificationQuestions`.

Conflicts:
- Recorded as `validationErrors` + `failureTypes`, with best-effort targeted repairs.

## Mid-way requirement changes (patch/edit mode)

Instead of re-running the full pipeline from the original prompt, you can apply **targeted edits** to an existing bundle:
- Parser: `compiler/patch/parse-patch.mjs`
- Applier: `compiler/patch/apply-patch.mjs`
- CLI: `scripts/sw-patch.mjs`

Patch examples (each line is an operation):
- `add role manager`
- `add entity invoice fields: number, amount:number!, status`
- `add field invoice.due_date:date`
- `remove entity ticket`

This mode applies ops, then re-generates schema from the updated **DesignIR**, re-runs refinement, cross-layer validation, and repair.

## Evaluation framework + metrics

Dataset: `eval/dataset.json`
- 10 real-ish product prompts
- 10 edge cases (vague/conflicting/incomplete)

Runner: `scripts/sw-eval.mjs`
- Produces `eval/results.json` with:
  - success rate
  - per-case latency
  - failure type counts (from diagnostics)

## Cost vs quality tradeoff

This system prioritizes **reliability** over expressiveness:
- Cheap/fast deterministic extraction → stable outputs
- Strict validators prevent “plausible but wrong” configs from becoming runnable artifacts
- Repair pass reduces retries and isolates changes

If you introduce an LLM, typical knobs:
- **Lower cost/latency**: smaller model for Intent Extraction + stronger validators/repairs
- **Higher quality**: larger model for Design + SchemaGen, but keep deterministic post-validation and targeted regeneration
