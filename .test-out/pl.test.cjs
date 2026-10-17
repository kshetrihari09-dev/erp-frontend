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

// tests/pollingLoop.test.ts
var import_node_test = require("node:test");
var import_strict = __toESM(require("node:assert/strict"));

// src/services/rateLimitState.ts
var DEFAULT_RETRY_AFTER_MS = 6e4;
var MAX_RETRY_AFTER_MS = 20 * 6e4;
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
function parseRetryAfterMs(value, now = Date.now()) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) {
    return Math.min(Math.max(0, Math.round(Number(text) * 1e3)), MAX_RETRY_AFTER_MS);
  }
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(0, at - now), MAX_RETRY_AFTER_MS);
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

// src/services/pollingLoop.ts
function describeError(err, now) {
  const e = err;
  const status = e?.status ?? e?.original?.response?.status;
  const retryAfterMs = parseRetryAfterMs(readHeader(e?.original?.response?.headers, "retry-after"), now);
  return { status, retryAfterMs };
}
function createPollingLoop(opts) {
  const now = opts.now ?? (() => Date.now());
  const random = opts.random ?? (() => Math.random());
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
  const maxBackoff = opts.maxBackoffMs ?? 5 * 6e4;
  const jitter = opts.jitter ?? 0.1;
  const empty = () => ({ data: void 0, error: null, failureCount: 0, lastSuccessAt: null });
  let state = empty();
  const listeners = /* @__PURE__ */ new Set();
  let retained = 0;
  let scope = null;
  let running = false;
  let paused = false;
  let timer = null;
  let controller = null;
  let inFlight = false;
  let generation = 0;
  let lastAttemptAt = 0;
  let nextEarliestAt = 0;
  const emit = (next) => {
    state = next;
    listeners.forEach((l) => l());
  };
  function withJitter(ms) {
    return Math.round(ms * (1 + (random() * 2 - 1) * jitter));
  }
  function backoffMs(failures) {
    return Math.min(maxBackoff, opts.getIntervalMs() * 2 ** Math.max(0, failures - 1));
  }
  function clearScheduled() {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
  }
  function schedule() {
    clearScheduled();
    if (!running || paused) return;
    const t = now();
    const interval = state.failureCount > 0 ? backoffMs(state.failureCount) : opts.getIntervalMs();
    const due = Math.max(
      lastAttemptAt ? lastAttemptAt + withJitter(interval) : t,
      // first ever attempt → now
      nextEarliestAt,
      getRateLimitedUntil()
      // another request got a 429
    );
    timer = setTimer(tick, Math.max(0, due - t));
  }
  async function tick() {
    timer = null;
    if (!running || paused || inFlight) return;
    if (getRateLimitedUntil() > now()) {
      schedule();
      return;
    }
    if (opts.canRun && !opts.canRun()) {
      lastAttemptAt = now();
      schedule();
      return;
    }
    const myGen = generation;
    inFlight = true;
    lastAttemptAt = now();
    controller = new AbortController();
    try {
      const data = await opts.fetcher(controller.signal);
      if (myGen !== generation) return;
      nextEarliestAt = 0;
      emit({ data, error: null, failureCount: 0, lastSuccessAt: now() });
    } catch (err) {
      if (myGen !== generation) return;
      const { status, retryAfterMs } = describeError(err, now());
      const failures = state.failureCount + 1;
      if (status === 429) {
        const waitMs = retryAfterMs ?? Math.max(backoffMs(failures), DEFAULT_RETRY_AFTER_MS);
        nextEarliestAt = now() + waitMs;
        noteRateLimited(waitMs, now());
      }
      emit({ ...state, error: err, failureCount: failures });
    } finally {
      if (myGen === generation) {
        inFlight = false;
        controller = null;
        schedule();
      }
    }
  }
  function start() {
    if (running) return;
    running = true;
    schedule();
  }
  function stop() {
    running = false;
    generation++;
    clearScheduled();
    if (inFlight) lastAttemptAt = 0;
    controller?.abort();
    controller = null;
    inFlight = false;
  }
  return {
    retain(nextScope) {
      if (scope !== nextScope) {
        const hadScope = scope !== null;
        scope = nextScope;
        if (hadScope) {
          generation++;
          controller?.abort();
          controller = null;
          inFlight = false;
          lastAttemptAt = 0;
          nextEarliestAt = 0;
          emit(empty());
          if (running) schedule();
        }
      }
      retained++;
      start();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        retained = Math.max(0, retained - 1);
        if (retained === 0) stop();
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    setPaused(next) {
      if (paused === next) return;
      paused = next;
      if (paused) clearScheduled();
      else if (running) schedule();
    },
    poke() {
      if (running && !paused) schedule();
    },
    reset() {
      stop();
      scope = null;
      lastAttemptAt = 0;
      nextEarliestAt = 0;
      emit(empty());
    },
    get isRunning() {
      return running;
    },
    get isPaused() {
      return paused;
    },
    get retainCount() {
      return retained;
    }
  };
}

// tests/pollingLoop.test.ts
function fakeClock() {
  let t = 1e6;
  let seq = 0;
  const timers = /* @__PURE__ */ new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id);
    },
    pending: () => timers.size,
    async advance(ms) {
      const end = t + ms;
      for (; ; ) {
        const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = Math.max(t, due[1].at);
        due[1].fn();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      }
      t = end;
    }
  };
}
var err429 = (retryAfter) => ({ status: 429, original: { response: { status: 429, headers: retryAfter ? { "retry-after": retryAfter } : {} } } });
function make(fetcher, extra = {}) {
  resetRateLimitState();
  const clock = fakeClock();
  let n = 0;
  const loop = createPollingLoop({
    fetcher: () => fetcher(++n),
    getIntervalMs: () => 6e4,
    jitter: 0,
    random: () => 0.5,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...extra
  });
  return { clock, loop, count: () => n };
}
(0, import_node_test.test)("parseRetryAfterMs handles seconds, HTTP-date, junk and clamps", () => {
  import_strict.default.equal(parseRetryAfterMs("120"), 12e4);
  import_strict.default.equal(parseRetryAfterMs("0"), 0);
  import_strict.default.equal(parseRetryAfterMs("Wed, 21 Oct 2015 07:28:30 GMT", Date.parse("Wed, 21 Oct 2015 07:28:00 GMT")), 3e4);
  import_strict.default.equal(parseRetryAfterMs("nonsense"), null);
  import_strict.default.equal(parseRetryAfterMs(void 0), null);
  import_strict.default.equal(parseRetryAfterMs("999999"), 20 * 6e4);
});
(0, import_node_test.test)("many retain() calls create ONE loop: one request per interval", async () => {
  const { clock, loop, count } = make(async () => ({ ok: true }));
  const releases = Array.from({ length: 10 }, () => loop.retain("u1:c1"));
  import_strict.default.equal(clock.pending(), 1, "exactly one timer scheduled");
  await clock.advance(0);
  import_strict.default.equal(count(), 1);
  await clock.advance(59e3);
  import_strict.default.equal(count(), 1);
  await clock.advance(1e3);
  import_strict.default.equal(count(), 2);
  await clock.advance(12e4);
  import_strict.default.equal(count(), 4);
  releases.slice(0, 9).forEach((r) => r());
  await clock.advance(6e4);
  import_strict.default.equal(count(), 5, "still running while one consumer remains");
  releases[9]();
  import_strict.default.equal(loop.isRunning, false);
  import_strict.default.equal(clock.pending(), 0);
  await clock.advance(6e5);
  import_strict.default.equal(count(), 5, "no polling after last release");
});
(0, import_node_test.test)("release is idempotent and remount right after unmount does not fire an extra request", async () => {
  const { clock, loop, count } = make(async () => ({ ok: true }));
  const r1 = loop.retain("s");
  await clock.advance(0);
  import_strict.default.equal(count(), 1);
  r1();
  r1();
  import_strict.default.equal(loop.retainCount, 0);
  const r2 = loop.retain("s");
  await clock.advance(5e3);
  import_strict.default.equal(count(), 1, "remount must not refetch early");
  await clock.advance(55e3);
  import_strict.default.equal(count(), 2);
  r2();
});
(0, import_node_test.test)("failures back off exponentially and never retry immediately", async () => {
  const { clock, loop, count } = make(async () => {
    throw { status: 500 };
  });
  loop.retain("s");
  await clock.advance(0);
  import_strict.default.equal(count(), 1);
  await clock.advance(59999);
  import_strict.default.equal(count(), 1);
  await clock.advance(1);
  import_strict.default.equal(count(), 2);
  await clock.advance(119999);
  import_strict.default.equal(count(), 2);
  await clock.advance(1);
  import_strict.default.equal(count(), 3);
  await clock.advance(239999);
  import_strict.default.equal(count(), 3);
  await clock.advance(1);
  import_strict.default.equal(count(), 4);
  await clock.advance(3e5);
  import_strict.default.equal(count(), 5);
  await clock.advance(3e5);
  import_strict.default.equal(count(), 6);
  import_strict.default.ok(loop.getSnapshot().failureCount >= 5);
});
(0, import_node_test.test)("success after failures resets the schedule to the base interval", async () => {
  const { clock, loop, count } = make(async (n) => {
    if (n <= 2) throw { status: 500 };
    return { ok: n };
  });
  loop.retain("s");
  await clock.advance(0);
  await clock.advance(6e4);
  await clock.advance(12e4);
  import_strict.default.equal(count(), 3);
  import_strict.default.equal(loop.getSnapshot().failureCount, 0);
  await clock.advance(6e4);
  import_strict.default.equal(count(), 4);
});
(0, import_node_test.test)("429 waits for Retry-After (longer than backoff) and is not retried before then", async () => {
  const { clock, loop, count } = make(async (n) => {
    if (n === 1) throw err429("300");
    return { ok: n };
  });
  loop.retain("s");
  await clock.advance(0);
  import_strict.default.equal(count(), 1);
  await clock.advance(299999);
  import_strict.default.equal(count(), 1, "must not retry within Retry-After");
  await clock.advance(1);
  import_strict.default.equal(count(), 2);
  import_strict.default.equal(loop.getSnapshot().failureCount, 0);
});
(0, import_node_test.test)("429 without a readable Retry-After still backs off (>= 60s default)", async () => {
  const { clock, loop, count } = make(async (n) => {
    if (n === 1) throw err429();
    return { ok: n };
  });
  loop.retain("s");
  await clock.advance(0);
  await clock.advance(59999);
  import_strict.default.equal(count(), 1);
  await clock.advance(1);
  import_strict.default.equal(count(), 2);
});
(0, import_node_test.test)("a 429 recorded by ANY other request also delays the poller", async () => {
  const { clock, loop, count } = make(async () => ({ ok: true }));
  loop.retain("s");
  await clock.advance(0);
  import_strict.default.equal(count(), 1);
  noteRateLimited(4e5, clock.now());
  import_strict.default.ok(getRateLimitedUntil() > clock.now());
  await clock.advance(399999);
  import_strict.default.equal(count(), 1);
  await clock.advance(1);
  import_strict.default.equal(count(), 2);
});
(0, import_node_test.test)("requests never overlap while one is slow", async () => {
  let resolveFirst = () => {
  };
  let active = 0, maxActive = 0;
  const { clock, loop, count } = make((n) => {
    active++;
    maxActive = Math.max(maxActive, active);
    return new Promise((res) => {
      const done = () => {
        active--;
        res({ n });
      };
      if (n === 1) resolveFirst = done;
      else done();
    });
  });
  loop.retain("s");
  await clock.advance(0);
  loop.retain("s");
  loop.retain("s");
  await clock.advance(18e4);
  import_strict.default.equal(count(), 1, "slow request still in flight \u2192 nothing else sent");
  resolveFirst(null);
  await clock.advance(0);
  await clock.advance(6e4);
  import_strict.default.equal(maxActive, 1);
  import_strict.default.ok(count() >= 2);
});
(0, import_node_test.test)("scope change drops old data and polls right away; stale in-flight response is ignored", async () => {
  let release = () => {
  };
  const { clock, loop, count } = make((n) => n === 1 ? new Promise((r) => {
    release = r;
  }) : Promise.resolve({ for: "new" }));
  loop.retain("userA:c1");
  await clock.advance(0);
  import_strict.default.equal(count(), 1);
  loop.retain("userB:c1");
  await clock.advance(0);
  import_strict.default.equal(count(), 2);
  release({ for: "old" });
  await clock.advance(0);
  import_strict.default.deepEqual(loop.getSnapshot().data, { for: "new" }, "old-scope response must not overwrite new-scope data");
});
(0, import_node_test.test)("reset() (logout) stops the loop, aborts the request and clears data", async () => {
  let signal;
  const clock = fakeClock();
  resetRateLimitState();
  const loop = createPollingLoop({ fetcher: (s) => {
    signal = s;
    return Promise.resolve({ x: 1 });
  }, getIntervalMs: () => 6e4, jitter: 0, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  loop.retain("s");
  await clock.advance(0);
  import_strict.default.ok(loop.getSnapshot().data);
  loop.reset();
  import_strict.default.equal(loop.isRunning, false);
  import_strict.default.equal(clock.pending(), 0);
  import_strict.default.equal(loop.getSnapshot().data, void 0);
  import_strict.default.equal(signal?.aborted, false);
});
(0, import_node_test.test)("canRun=false (offline) pauses requests without spinning", async () => {
  let online = false;
  const { clock, loop, count } = make(async () => ({ ok: true }), { canRun: () => online });
  loop.retain("s");
  await clock.advance(0);
  import_strict.default.equal(count(), 0);
  await clock.advance(59e3);
  import_strict.default.equal(count(), 0);
  online = true;
  await clock.advance(1e3);
  import_strict.default.equal(count(), 1);
});
(0, import_node_test.test)("setPaused(true): no timers, no requests across many intervals", async () => {
  const { clock, loop, count } = make(async () => "ok");
  loop.retain("s");
  await clock.advance(0);
  import_strict.default.equal(count(), 1);
  loop.setPaused(true);
  import_strict.default.equal(clock.pending(), 0, "pausing cancels the scheduled timer");
  await clock.advance(30 * 6e4);
  import_strict.default.equal(count(), 1, "nothing sent while paused");
  import_strict.default.equal(loop.isPaused, true);
});
(0, import_node_test.test)("resume after a long pause sends exactly ONE catch-up request immediately, then resumes the normal cadence", async () => {
  const { clock, loop, count } = make(async () => "ok");
  loop.retain("s");
  await clock.advance(0);
  loop.setPaused(true);
  await clock.advance(60 * 6e4);
  loop.setPaused(false);
  await clock.advance(0);
  import_strict.default.equal(count(), 2, "one catch-up poll, not one per missed interval");
  await clock.advance(6e4);
  import_strict.default.equal(count(), 3);
});
(0, import_node_test.test)("resume shortly after pausing does not fire early (cadence is relative to the last real attempt)", async () => {
  const { clock, loop, count } = make(async () => "ok");
  loop.retain("s");
  await clock.advance(0);
  await clock.advance(1e4);
  loop.setPaused(true);
  loop.setPaused(false);
  await clock.advance(0);
  import_strict.default.equal(count(), 1);
  await clock.advance(5e4);
  import_strict.default.equal(count(), 2);
});
(0, import_node_test.test)("a request in flight when paused finishes but does not re-arm the timer", async () => {
  let release;
  const { clock, loop, count } = make(() => new Promise((r) => {
    release = () => r("ok");
  }));
  loop.retain("s");
  await clock.advance(0);
  import_strict.default.equal(count(), 1);
  loop.setPaused(true);
  release();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  import_strict.default.equal(clock.pending(), 0);
  await clock.advance(10 * 6e4);
  import_strict.default.equal(count(), 1);
});
(0, import_node_test.test)("resume still honours an active Retry-After / rate-limit cooldown", async () => {
  const { clock, loop, count } = make(async (n) => {
    if (n === 1) throw err429("300");
    return "ok";
  });
  loop.retain("s");
  await clock.advance(0);
  import_strict.default.equal(count(), 1);
  loop.setPaused(true);
  await clock.advance(6e4);
  loop.setPaused(false);
  await clock.advance(0);
  import_strict.default.equal(count(), 1, "cooldown (300s) not over yet");
  await clock.advance(25e4);
  import_strict.default.equal(count(), 2);
});
(0, import_node_test.test)("setPaused is idempotent and works before the loop is retained", async () => {
  const { clock, loop, count } = make(async () => "ok");
  loop.setPaused(true);
  loop.setPaused(true);
  loop.retain("s");
  await clock.advance(5 * 6e4);
  import_strict.default.equal(count(), 0, "retained while paused \u2192 still silent");
  loop.setPaused(false);
  await clock.advance(0);
  import_strict.default.equal(count(), 1);
});
