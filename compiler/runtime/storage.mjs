import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function safeReadJson(p, fallback) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

export function createStorage({ mode = "file", dataDir = ".runtime-data", bundle }) {
  if (mode === "memory") return createMemoryStorage(bundle);
  if (mode === "file") return createFileStorage({ bundle, dataDir });
  if (mode === "supabase") return createSupabaseStorage(bundle);
  throw new Error(`Unknown storage mode: ${mode}`);
}

function createMemoryStorage(bundle) {
  const db = new Map();
  for (const e of bundle.schema.db.entities) db.set(e.name, new Map());

  return {
    mode: "memory",
    async list(entity) {
      const store = db.get(entity);
      if (!store) throw new Error("entity_store_missing");
      return Array.from(store.values());
    },
    async get(entity, id) {
      const store = db.get(entity);
      if (!store) throw new Error("entity_store_missing");
      return store.get(id) ?? null;
    },
    async create(entity, data) {
      const store = db.get(entity);
      if (!store) throw new Error("entity_store_missing");
      const id = randomUUID();
      const record = { id, ...data };
      store.set(id, record);
      return record;
    },
    async update(entity, id, data) {
      const store = db.get(entity);
      if (!store) throw new Error("entity_store_missing");
      const prev = store.get(id);
      if (!prev) return null;
      const next = { ...prev, ...data, id };
      store.set(id, next);
      return next;
    },
    async delete(entity, id) {
      const store = db.get(entity);
      if (!store) throw new Error("entity_store_missing");
      return store.delete(id);
    },
  };
}

function createFileStorage({ bundle, dataDir }) {
  const root = path.isAbsolute(dataDir) ? dataDir : path.join(process.cwd(), dataDir);
  ensureDir(root);
  const fileFor = (entity) => path.join(root, `${entity}.json`);

  // initialize entity files if missing
  for (const e of bundle.schema.db.entities) {
    const p = fileFor(e.name);
    const current = safeReadJson(p, null);
    if (current == null) writeFileSync(p, JSON.stringify({ byId: {} }, null, 2), "utf8");
  }

  const load = (entity) => safeReadJson(fileFor(entity), { byId: {} });
  const save = (entity, value) => {
    const p = fileFor(entity);
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
    renameSync(tmp, p);
  };

  return {
    mode: "file",
    async list(entity) {
      const { byId } = load(entity);
      return Object.values(byId);
    },
    async get(entity, id) {
      const { byId } = load(entity);
      return byId[id] ?? null;
    },
    async create(entity, data) {
      const doc = load(entity);
      const id = randomUUID();
      const record = { id, ...data };
      doc.byId[id] = record;
      save(entity, doc);
      return record;
    },
    async update(entity, id, data) {
      const doc = load(entity);
      const prev = doc.byId[id];
      if (!prev) return null;
      const next = { ...prev, ...data, id };
      doc.byId[id] = next;
      save(entity, doc);
      return next;
    },
    async delete(entity, id) {
      const doc = load(entity);
      const existed = !!doc.byId[id];
      delete doc.byId[id];
      save(entity, doc);
      return existed;
    },
  };
}

function createSupabaseStorage(bundle) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) for supabase storage");
  }

  return {
    mode: "supabase",
    async _client() {
      const { createClient } = await import("@supabase/supabase-js");
      return createClient(url, key, { auth: { persistSession: false } });
    },
    async list(entity) {
      const client = await this._client();
      const { data, error } = await client.from(entity).select("*").limit(500);
      if (error) throw error;
      return data ?? [];
    },
    async get(entity, id) {
      const client = await this._client();
      const { data, error } = await client.from(entity).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    async create(entity, data) {
      const client = await this._client();
      const record = { id: randomUUID(), ...data };
      const { data: out, error } = await client.from(entity).insert(record).select("*").single();
      if (error) throw error;
      return out ?? record;
    },
    async update(entity, id, data) {
      const client = await this._client();
      const { data: out, error } = await client.from(entity).update(data).eq("id", id).select("*").maybeSingle();
      if (error) throw error;
      return out ?? null;
    },
    async delete(entity, id) {
      const client = await this._client();
      const { error } = await client.from(entity).delete().eq("id", id);
      if (error) throw error;
      return true;
    },
  };
}
