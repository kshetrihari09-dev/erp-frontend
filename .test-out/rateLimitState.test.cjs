"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// tests/rateLimitState.test.ts
var import_node_test = require("node:test");
var import_strict = __toESM(require("node:assert/strict"));

// src/services/rateLimitState.ts
var DEFAULT_RETRY_AFTER_MS = 6e4;
var MAX_RETRY_AFTER_MS = 20 * 6e4;
var GLOBAL_LIMITERS = /* @__PURE__ */ new Set(["user", "company", "ip"]);
var rateLimitedUntil = 0;
var scopedUntil = /* @__PURE__ */ new Map();
function readHeader(headers, name) {
  if (!headers) return void 0;
  const h = headers;
  if (typeof h.get === "function") {
    const v = h.get(name);
    if (v != null) return String(v);
  }
  const lower = name.toLowerCase();
  for (const key of Object.keys(h)) {
    if (key.toLowerCase() === lower && h[key] != null) return String(h[key]);
  }
  return void 0;
}
function noteRateLimited(retryAfterMs, now = Date.now(), scope = "global") {
  const delay = retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
  if (scope === "global") {
    rateLimitedUntil = Math.max(rateLimitedUntil, now + delay);
  } else {
    scopedUntil.set(scope, Math.max(scopedUntil.get(scope) ?? 0, now + delay));
  }
  return delay;
}
function getRateLimitedUntil(scope = "global") {
  return scope === "global" ? rateLimitedUntil : Math.max(rateLimitedUntil, scopedUntil.get(scope) ?? 0);
}
function resetRateLimitState() {
  rateLimitedUntil = 0;
  scopedUntil.clear();
}
function classifyRateLimit(headers, body) {
  const source = readHeader(headers, "x-ratelimit-source")?.toLowerCase() ?? null;
  const limiterHeader = readHeader(headers, "x-ratelimit-limiter")?.toLowerCase() ?? null;
  const b = body && typeof body === "object" ? body : {};
  const code = typeof b.code === "string" ? b.code : null;
  const limiter = limiterHeader ?? (typeof b.limiter === "string" ? b.limiter.toLowerCase() : null);
  if (source === "client" || code === "CLIENT_RATE_LIMIT_COOLDOWN") return { kind: "client", limiter, code };
  if (source === "application") return { kind: "application", limiter: null, code };
  if (source === "nginx") return { kind: "proxy", limiter: "nginx", code };
  if (source === "app-limiter" || code === "RATE_LIMITED" || limiterHeader) return { kind: "limiter", limiter, code };
  if (code) return { kind: "application", limiter: null, code };
  return { kind: "unknown", limiter: null, code: null };
}
function scopeForLimiter(limiter) {
  if (!limiter || GLOBAL_LIMITERS.has(limiter) || limiter === "nginx") return "global";
  if (limiter.startsWith("auth") || limiter === "otp_send") return "auth";
  if (limiter === "reports") return "reports";
  if (limiter === "scanner") return "scanner";
  if (limiter === "ocr_upload") return "ocr";
  if (limiter === "heavy_ops") return "heavy";
  return "global";
}
function scopeForUrl(url) {
  const path = String(url ?? "").split("?")[0];
  if (/(^|\/)(reports|stock-register)(\/|$)/.test(path)) return "reports";
  if (/(^|\/)scanner(\/|$)/.test(path)) return "scanner";
  if (/(^|\/)purchase-scans(\/|$)/.test(path)) return "ocr";
  if (/(^|\/)settings\/backup(\/|$)/.test(path)) return "heavy";
  if (/(^|\/)auth(\/|$)/.test(path)) return "auth";
  return null;
}
function cooldownRemainingMs(url, now = Date.now()) {
  const scope = scopeForUrl(url);
  const until = Math.max(rateLimitedUntil, scope ? scopedUntil.get(scope) ?? 0 : 0);
  return Math.max(0, until - now);
}

// tests/rateLimitState.test.ts
(0, import_node_test.beforeEach)(() => resetRateLimitState());
(0, import_node_test.test)("classifyRateLimit: backend limiter / nginx / application / client / unknown infrastructure", () => {
  import_strict.default.deepEqual(classifyRateLimit({ "x-ratelimit-source": "app-limiter", "x-ratelimit-limiter": "user" }, { code: "RATE_LIMITED" }), { kind: "limiter", limiter: "user", code: "RATE_LIMITED" });
  import_strict.default.equal(classifyRateLimit({ "X-RateLimit-Limiter": "reports" }, void 0).kind, "limiter");
  import_strict.default.equal(classifyRateLimit({}, { code: "RATE_LIMITED", limiter: "ip" }).limiter, "ip");
  import_strict.default.equal(classifyRateLimit({ "x-ratelimit-source": "nginx" }, void 0).kind, "proxy");
  import_strict.default.equal(classifyRateLimit({ "x-ratelimit-source": "application" }, { code: "PIN_LOCKED" }).kind, "application");
  import_strict.default.equal(classifyRateLimit({}, { code: "OTP_QUOTA_EXCEEDED" }).kind, "application");
  import_strict.default.equal(classifyRateLimit({ "x-ratelimit-source": "client" }, void 0).kind, "client");
  import_strict.default.equal(classifyRateLimit({}, { code: "CLIENT_RATE_LIMIT_COOLDOWN" }).kind, "client");
  import_strict.default.equal(classifyRateLimit({}, "<html>Too Many Requests</html>").kind, "unknown");
  import_strict.default.equal(classifyRateLimit(void 0, void 0).kind, "unknown");
});
(0, import_node_test.test)("scopeForLimiter: baseline limiters are global, specialised limiters are scoped", () => {
  for (const l of ["user", "company", "ip", "nginx", null]) import_strict.default.equal(scopeForLimiter(l), "global");
  import_strict.default.equal(scopeForLimiter("auth_fail"), "auth");
  import_strict.default.equal(scopeForLimiter("otp_send"), "auth");
  import_strict.default.equal(scopeForLimiter("auth_sensitive"), "auth");
  import_strict.default.equal(scopeForLimiter("reports"), "reports");
  import_strict.default.equal(scopeForLimiter("scanner"), "scanner");
  import_strict.default.equal(scopeForLimiter("ocr_upload"), "ocr");
  import_strict.default.equal(scopeForLimiter("heavy_ops"), "heavy");
});
(0, import_node_test.test)("scopeForUrl maps route families (with or without baseURL / query string)", () => {
  import_strict.default.equal(scopeForUrl("/reports/sales?from=1"), "reports");
  import_strict.default.equal(scopeForUrl("/stock-register/export"), "reports");
  import_strict.default.equal(scopeForUrl("/scanner/products/barcode/1"), "scanner");
  import_strict.default.equal(scopeForUrl("/purchase-scans/abc"), "ocr");
  import_strict.default.equal(scopeForUrl("/settings/backup/run"), "heavy");
  import_strict.default.equal(scopeForUrl("/auth/login"), "auth");
  import_strict.default.equal(scopeForUrl("/products"), null);
  import_strict.default.equal(scopeForUrl("/sales/reports-like"), null);
  import_strict.default.equal(scopeForUrl(void 0), null);
});
(0, import_node_test.test)("a scoped cooldown only holds back its own family; the global one holds back everything", () => {
  const t = 1e6;
  noteRateLimited(3e4, t, "reports");
  import_strict.default.equal(cooldownRemainingMs("/reports/sales", t + 1e3), 29e3);
  import_strict.default.equal(cooldownRemainingMs("/products", t + 1e3), 0);
  import_strict.default.equal(getRateLimitedUntil(), 0);
  import_strict.default.equal(getRateLimitedUntil("reports"), t + 3e4);
  noteRateLimited(1e4, t, "global");
  import_strict.default.equal(cooldownRemainingMs("/products", t + 1e3), 9e3);
  import_strict.default.equal(cooldownRemainingMs("/reports/sales", t + 1e3), 29e3);
});
(0, import_node_test.test)("cooldown never shrinks when a shorter one arrives", () => {
  noteRateLimited(6e4, 0);
  noteRateLimited(5e3, 0);
  import_strict.default.equal(getRateLimitedUntil(), 6e4);
});
