/**
 * Tests — lib/google-proxy.mjs (relais Apps Script vers Google Calendar).
 * Lancer : node --test tests/google-proxy.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { proxyRequest, isProxyResult, CALENDAR_API_PREFIX } from "../lib/google-proxy.mjs";

const SECRET = "s3cret";
const EVENTS_URL = `${CALENDAR_API_PREFIX}calendars/primary/events?singleEvents=true`;

/** Faux relais : imite Apps Script, y compris la redirection 302 → GET. */
function startFakeProxy(handler) {
  const received = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/exec") {
        received.push(JSON.parse(raw));
        res.writeHead(302, { Location: `/echo?n=${received.length}` });
        res.end();
        return;
      }
      const n = Number(new URL(req.url, "http://x").searchParams.get("n"));
      const { status = 200, contentType = "application/json", text } = handler(received[n - 1], n);
      res.writeHead(status, { "Content-Type": contentType });
      res.end(text);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}/exec`, received, close: () => server.close() });
    });
  });
}

test("isProxyResult valide la forme { status, body }", () => {
  assert.equal(isProxyResult({ status: 200, body: "{}" }), true);
  assert.equal(isProxyResult({ status: "200", body: "{}" }), false);
  assert.equal(isProxyResult({ status: 200 }), false);
  assert.equal(isProxyResult(null), false);
});

test("GET : suit la redirection Apps Script et renvoie status/body de Google", async () => {
  const proxy = await startFakeProxy(() => ({
    text: JSON.stringify({ status: 200, body: '{"items":[],"nextSyncToken":"abc"}' }),
  }));
  try {
    const r = await proxyRequest({ proxyUrl: proxy.url, secret: SECRET, url: EVENTS_URL });
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), { items: [], nextSyncToken: "abc" });
    assert.equal(proxy.received[0].secret, SECRET);
    assert.equal(proxy.received[0].method, "GET");
    assert.equal(proxy.received[0].url, EVENTS_URL);
  } finally {
    proxy.close();
  }
});

test("POST : transmet le corps JSON, et le 410 de Google remonte tel quel", async () => {
  const proxy = await startFakeProxy((req) => ({
    text: JSON.stringify({ status: req.method === "POST" ? 200 : 410, body: '{"id":"evt1"}' }),
  }));
  try {
    const body = JSON.stringify({ summary: "RDV" });
    const r = await proxyRequest({ proxyUrl: proxy.url, secret: SECRET, url: EVENTS_URL, method: "post", body });
    assert.equal(r.status, 200);
    assert.equal(proxy.received[0].method, "POST");
    assert.equal(proxy.received[0].body, body);
    const gone = await proxyRequest({ proxyUrl: proxy.url, secret: SECRET, url: EVENTS_URL });
    assert.equal(gone.status, 410);
  } finally {
    proxy.close();
  }
});

test("GET : une erreur transitoire est retentée une fois", async () => {
  const proxy = await startFakeProxy((_req, n) =>
    n === 1 ? { status: 500, text: "boom" } : { text: JSON.stringify({ status: 200, body: "{}" }) }
  );
  try {
    const r = await proxyRequest({ proxyUrl: proxy.url, secret: SECRET, url: EVENTS_URL, retryDelayMs: 1 });
    assert.equal(r.status, 200);
    assert.equal(proxy.received.length, 2);
  } finally {
    proxy.close();
  }
});

test("POST : jamais rejoué après une erreur (pas de doublon d'événement)", async () => {
  const proxy = await startFakeProxy(() => ({ status: 500, text: "boom" }));
  try {
    await assert.rejects(
      proxyRequest({ proxyUrl: proxy.url, secret: SECRET, url: EVENTS_URL, method: "POST", body: "{}", retryDelayMs: 1 }),
      /HTTP 500/
    );
    assert.equal(proxy.received.length, 1);
  } finally {
    proxy.close();
  }
});

test("mauvais secret : erreur explicite, sans nouvelle tentative", async () => {
  const proxy = await startFakeProxy(() => ({
    text: JSON.stringify({ status: 403, body: '{"error":"proxy_forbidden"}' }),
  }));
  try {
    await assert.rejects(
      proxyRequest({ proxyUrl: proxy.url, secret: "faux", url: EVENTS_URL, retryDelayMs: 1 }),
      /secret refusé/
    );
    assert.equal(proxy.received.length, 1);
  } finally {
    proxy.close();
  }
});

test("page HTML d'erreur Apps Script (quota, déploiement) : erreur lisible", async () => {
  const proxy = await startFakeProxy(() => ({ contentType: "text/html", text: "<html>Service invoked too many times</html>" }));
  try {
    await assert.rejects(
      proxyRequest({ proxyUrl: proxy.url, secret: SECRET, url: EVENTS_URL, retryDelayMs: 1 }),
      /non JSON/
    );
  } finally {
    proxy.close();
  }
});

test("refuse les URL hors API Calendar et les méthodes inconnues, sans appel réseau", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    throw new Error("ne doit pas être appelé");
  };
  await assert.rejects(
    proxyRequest({ proxyUrl: "http://x/exec", secret: SECRET, url: "https://www.googleapis.com/gmail/v1/users/me/messages", fetchImpl }),
    /hors API Calendar/
  );
  await assert.rejects(
    proxyRequest({ proxyUrl: "http://x/exec", secret: SECRET, url: EVENTS_URL, method: "TRACE", fetchImpl }),
    /méthode TRACE refusée/
  );
  await assert.rejects(proxyRequest({ proxyUrl: undefined, secret: SECRET, url: EVENTS_URL, fetchImpl }), /mal configuré/);
  assert.equal(calls, 0);
});
