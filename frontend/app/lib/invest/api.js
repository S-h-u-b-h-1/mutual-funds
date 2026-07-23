"use client";

const GET_TTL = 4000;
const cache = new Map();
const inFlight = new Map();
let activeSessionKey = null;

export function setInvestSessionKey(key) {
  if (key === activeSessionKey) return;
  activeSessionKey = key;
  cache.clear();
  inFlight.clear();
}

export class InvestApiError extends Error {
  constructor(message, { status = 0, code = "unknown", body = null } = {}) {
    super(message);
    this.name = "InvestApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function safeMessage(status, body) {
  if (status === 401) return "Your secure session has expired. Sign in again to continue.";
  if (status === 403) return "You do not have permission to view this workspace.";
  if (status === 404) return "This workspace feature is not available yet.";
  if (status === 0) return "You appear to be offline. Check your connection and try again.";
  return body?.error || "Something went wrong. Please try again.";
}

async function requestJson(path, options = {}) {
  const method = options.method || "GET";
  if (method === "GET") {
    const cached = cache.get(path);
    if (cached && cached.expires > Date.now()) return cached.value;
    if (inFlight.has(path)) return inFlight.get(path);
  }

  const promise = (async () => {
    let response;
    let body = {};
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetch(path, {
          ...options,
          credentials: "same-origin",
          headers: { Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) },
        });
        body = await response.json().catch(() => ({}));
      } catch {
        if (attempt === 0) continue;
        throw new InvestApiError(safeMessage(0), { code: "offline" });
      }
      if (![502, 503, 504].includes(response.status) || attempt === 1) break;
    }
    if (!response.ok) throw new InvestApiError(safeMessage(response.status, body), { status: response.status, body, code: response.status === 401 ? "unauthorized" : response.status === 404 ? "not_found" : "request_failed" });
    if (method === "GET") cache.set(path, { value: body, expires: Date.now() + GET_TTL });
    else { cache.clear(); inFlight.clear(); }
    return body;
  })();
  if (method === "GET") inFlight.set(path, promise);
  try { return await promise; } finally { if (method === "GET") inFlight.delete(path); }
}

function order(value) {
  if (!value || typeof value !== "object") throw new InvestApiError("The order response was invalid.", { code: "invalid_response" });
  return { ...value, amount: value.amount == null ? null : Number(value.amount), units: value.units == null ? null : Number(value.units) };
}

export const investApi = {
  getProfile: () => requestJson("/api/v1/invest/profile"),
  updateProfile: (payload) => requestJson("/api/v1/invest/profile", { method: "PUT", body: JSON.stringify(payload) }),
  getCompliance: () => requestJson("/api/v1/invest/compliance"),
  submitCompliance: (itemKey, payload) => requestJson(`/api/v1/invest/compliance/items/${itemKey}`, { method: "POST", body: JSON.stringify(payload) }),
  updateRiskProfile: (payload) => requestJson("/api/v1/invest/risk-profile", { method: "PUT", body: JSON.stringify(payload) }),
  updatePreferences: (payload) => requestJson("/api/v1/invest/preferences", { method: "PUT", body: JSON.stringify(payload) }),
  openAccount: () => requestJson("/api/v1/invest/account", { method: "POST", body: "{}" }),
  getOrders: async () => { const value = await requestJson("/api/v1/invest/orders"); return { ...value, orders: Array.isArray(value.orders) ? value.orders.map(order) : [] }; },
  createOrder: async (payload) => { const value = await requestJson("/api/v1/invest/orders", { method: "POST", body: JSON.stringify(payload) }); return { ...value, order: order(value.order) }; },
  getOrder: async (orderId) => { const value = await requestJson(`/api/v1/invest/orders/${orderId}`); return { ...value, order: order(value.order) }; },
  submitOrder: async (orderId) => { const value = await requestJson(`/api/v1/invest/orders/${orderId}/submit`, { method: "POST", body: "{}" }); return { ...value, order: order(value.order) }; },
  cancelOrder: async (orderId) => { const value = await requestJson(`/api/v1/invest/orders/${orderId}/cancel`, { method: "POST", body: "{}" }); return { ...value, order: order(value.order) }; },
  retryOrder: async (orderId) => { const value = await requestJson(`/api/v1/invest/orders/${orderId}/retry`, { method: "POST", body: "{}" }); return { ...value, order: order(value.order) }; },
};

export const sipApi = {
  list: async () => {
    const value = await requestJson("/api/v1/invest/sips");
    return { ...value, sips: Array.isArray(value.sips) ? value.sips : [] };
  },
  create: (payload) => requestJson("/api/v1/invest/sips", { method: "POST", body: JSON.stringify(payload) }),
};

async function uploadStatement(formData, signal) {
  let response;
  let body = {};
  try {
    response = await fetch("/api/v1/portfolio/upload", { method: "POST", body: formData, signal, credentials: "same-origin" });
    body = await response.json().catch(() => ({}));
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new InvestApiError(safeMessage(0), { code: "offline" });
  }
  if (!response.ok) throw new InvestApiError(safeMessage(response.status, body), { status: response.status, body, code: body?.code || "request_failed" });
  cache.clear();
  return body;
}

export const portfolioApi = {
  getPortfolio: () => requestJson("/api/v1/invest/portfolio"),
  getSummary: () => requestJson("/api/v1/invest/portfolio/summary"),
  getHoldings: () => requestJson("/api/v1/invest/portfolio/holdings"),
  getAllocation: () => requestJson("/api/v1/invest/portfolio/allocation"),
  getPerformance: () => requestJson("/api/v1/invest/portfolio/performance"),
  getHistory: (limit = 50) => requestJson(`/api/v1/invest/portfolio/history?limit=${Math.min(200, Math.max(1, limit))}`),
  connect: () => requestJson("/api/v1/invest/portfolio/connect", { method: "POST", body: "{}" }),
  getPresentationData: async () => {
    const value = await requestJson("/api/v1/invest/portfolio");
    return {
      holdings: value.holdings || [],
      unresolved: value.unresolved || [],
      report: {
        portfolioSummary: value.summary || {},
        allocations: value.allocation || {},
        topHoldings: value.topHoldings || [],
        performanceLeaders: value.performanceLeaders || [],
        strengths: value.strengths || [],
        weaknesses: value.weaknesses || [],
        bottomLine: value.bottomLine || null,
      },
      computedAt: value.summary?.computedAt || null,
    };
  },
  uploadStatement,
};

export const documentsApi = {
  list: () => requestJson("/api/v1/invest/documents"),
  download: (documentId) => requestJson(`/api/v1/invest/documents/${documentId}/download`),
};

export const notificationsApi = {
  list: () => requestJson("/api/v1/invest/notifications"),
  markRead: (notificationId) => requestJson(`/api/v1/invest/notifications/${notificationId}/read`, { method: "POST", body: "{}" }),
};

export const advisorApi = {
  getWorkspace: () => requestJson("/api/v1/invest/advisor"),
};
