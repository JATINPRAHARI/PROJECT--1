# Source Weaver

This repo contains:
- A **Vite + React** frontend (deployable to Vercel as a static site).
- A **compiler-like pipeline** (NL → IR → validated → refined/repair → executable bundle) plus a minimal Node runtime for local execution.

## Frontend (Vercel deployable)

### Local run
- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

### Vercel settings
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

## Compiler system (local)

Docs: `COMPILER_SYSTEM.md`

### Compile a bundle
`npm run sw:compile -- --prompt "Build a small CRM for leads with roles admin and agent" --out dist/compiler --pretty`

### Patch an existing bundle (mid-way requirement changes)
`npm run sw:patch -- --bundle dist/compiler/bundle.json --patch "add entity invoice fields: number, amount:number!, status" --out dist/compiler --pretty`

### Run the runtime (persistent file storage by default)
`node scripts/sw-run.mjs --bundle dist/compiler/bundle.json --port 8790 --storage file --dataDir .runtime-data`

Then open: `http://127.0.0.1:8790/`

### Evaluate with dataset + metrics
`npm run sw:eval`

Outputs: `eval/results.json`

## Notes
- The Node runtime (`sw-run`) is a long-running server intended for local use; if you want it hosted on Vercel, it needs to be adapted to Vercel Serverless Functions (or deployed on a Node host).

