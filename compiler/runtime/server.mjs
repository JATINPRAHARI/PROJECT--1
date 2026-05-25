import http from "node:http";
import { URL } from "node:url";

import { createStorage } from "./storage.mjs";

function htmlPage(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head><body style="font-family:system-ui,Segoe UI,Arial;padding:16px;max-width:920px;margin:0 auto">${body}</body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function send(res, status, contentType, body) {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function matchPath(pattern, pathname) {
  const p = pattern.split("/").filter(Boolean);
  const a = pathname.split("/").filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = a[i];
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function startRuntime(bundle, { port = 8787, storageMode = "file", dataDir = ".runtime-data" } = {}) {
  const storage = createStorage({ mode: storageMode, dataDir, bundle });

  const endpoints = bundle.schema.api.endpoints;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const role = req.headers["x-user-role"] ? String(req.headers["x-user-role"]) : bundle.schema.auth.defaultRole;

    if (url.pathname === "/") {
      const links = bundle.schema.ui.screens
        .map((s) => `<li><a href="/ui/${encodeURIComponent(s.id)}">${escapeHtml(s.title)}</a> (${escapeHtml(s.kind)})</li>`)
        .join("");
      const body = `
        <h1>${escapeHtml(bundle.schema.ui.screens[0]?.title ?? bundle.intent.productName)}</h1>
        <p><b>Role:</b> send header <code>x-user-role</code>. Default: <code>${escapeHtml(bundle.schema.auth.defaultRole)}</code></p>
        <h2>Screens</h2>
        <ul>${links}</ul>
      `;
      return send(res, 200, "text/html; charset=utf-8", htmlPage(bundle.intent.productName, body));
    }

    if (url.pathname.startsWith("/ui/") && req.method === "GET") {
      const screenId = decodeURIComponent(url.pathname.slice("/ui/".length));
      const screen = bundle.schema.ui.screens.find((s) => s.id === screenId);
      if (!screen) return send(res, 404, "text/plain; charset=utf-8", "Screen not found");

      if (screen.kind === "list" && screen.entity) {
        const rows = await storage.list(screen.entity);
        const items = rows
          .map((r) => `<li><code>${escapeHtml(r.id)}</code> ${escapeHtml(JSON.stringify(r))}</li>`)
          .join("");
        const body = `<h1>${escapeHtml(screen.title)}</h1><p><a href="/">Home</a></p><ul>${items || "<li>(empty)</li>"}</ul>`;
        return send(res, 200, "text/html; charset=utf-8", htmlPage(screen.title, body));
      }

      if (screen.kind === "create" && screen.entity) {
        const formFields = screen.fields
          .map((f) => `<label style="display:block;margin:8px 0">${escapeHtml(f)}<br/><input name="${escapeHtml(f)}" style="width:100%;padding:8px"/></label>`)
          .join("");
        const body = `
          <h1>${escapeHtml(screen.title)}</h1>
          <p><a href="/">Home</a></p>
          <form method="POST" action="/ui/${encodeURIComponent(screen.id)}">
            ${formFields}
            <button style="padding:10px 14px">Create</button>
          </form>
        `;
        return send(res, 200, "text/html; charset=utf-8", htmlPage(screen.title, body));
      }

      return send(res, 200, "text/html; charset=utf-8", htmlPage(screen.title, `<h1>${escapeHtml(screen.title)}</h1><p><a href="/">Home</a></p>`));
    }

    if (url.pathname.startsWith("/ui/") && req.method === "POST") {
      const screenId = decodeURIComponent(url.pathname.slice("/ui/".length));
      const screen = bundle.schema.ui.screens.find((s) => s.id === screenId);
      if (!screen || !screen.submitToApi) return send(res, 400, "text/plain; charset=utf-8", "Bad screen");
      const endpoint = endpoints.find((e) => e.id === screen.submitToApi);
      if (!endpoint) return send(res, 400, "text/plain; charset=utf-8", "Bad endpoint");

      // Basic form-url-encoded parsing
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      await new Promise((r) => req.on("end", r));
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = Object.fromEntries(new URLSearchParams(raw));

      const result = await handleEndpoint({ endpoint, role, body, storage });
      if (!result.ok) return send(res, result.status, "text/plain; charset=utf-8", result.error);
      res.writeHead(302, { location: `/ui/${encodeURIComponent(screen.entity)}-list` });
      return res.end();
    }

    // API dispatch
    for (const endpoint of endpoints) {
      if (endpoint.method !== req.method) continue;
      const params = matchPath(endpoint.path, url.pathname);
      if (!params) continue;

      let body = {};
      if (req.method === "POST" || req.method === "PUT") {
        try {
          body = await parseJsonBody(req);
        } catch {
          return send(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "invalid_json" }));
        }
      }
      const result = await handleEndpoint({ endpoint, role, body, storage, params });
      if (!result.ok) return send(res, result.status, "application/json; charset=utf-8", JSON.stringify({ error: result.error }));
      return send(res, 200, "application/json; charset=utf-8", JSON.stringify(result.data));
    }

    return send(res, 404, "text/plain; charset=utf-8", "Not found");
  });

  server.listen(port);
  return { port, close: () => server.close() };
}

async function handleEndpoint({ endpoint, role, body, storage, params }) {
  if (!endpoint.rolesAllowed.includes(role)) return { ok: false, status: 403, error: "forbidden" };
  if (!endpoint.entity) return { ok: false, status: 500, error: "endpoint_missing_entity" };

  const id = params?.id;
  if (endpoint.action === "list") return { ok: true, data: await storage.list(endpoint.entity) };
  if (endpoint.action === "get") {
    if (!id) return { ok: false, status: 400, error: "missing_id" };
    return { ok: true, data: await storage.get(endpoint.entity, id) };
  }
  if (endpoint.action === "create") {
    return { ok: true, data: await storage.create(endpoint.entity, body) };
  }
  if (endpoint.action === "update") {
    if (!id) return { ok: false, status: 400, error: "missing_id" };
    const next = await storage.update(endpoint.entity, id, body);
    if (!next) return { ok: false, status: 404, error: "not_found" };
    return { ok: true, data: next };
  }
  if (endpoint.action === "delete") {
    if (!id) return { ok: false, status: 400, error: "missing_id" };
    const existed = await storage.delete(endpoint.entity, id);
    return { ok: true, data: { deleted: existed } };
  }
  return { ok: false, status: 500, error: "unknown_action" };
}
