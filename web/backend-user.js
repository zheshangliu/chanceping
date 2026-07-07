/**
 * ChancePing 匿名访客上下文。
 *
 * 不引入登录；只让旧“我的雷达”API 与 Chat Window 使用同一浏览器访客 ID，
 * 避免公开部署时所有访客共享 demo_user 的自定义雷达。
 */
(function () {
  "use strict";

  const STORAGE_KEY = "chanceping_hero_visitor_user_id";
  const USER_ID_HEADER = "X-ChancePing-User-Id";

  function cleanUserId(value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || text.length > 96) return "";
    return /^[A-Za-z0-9_.:-]+$/.test(text) ? text : "";
  }

  function createVisitorId() {
    const random = Math.random().toString(36).slice(2, 10);
    return `visitor_${Date.now().toString(36)}_${random}`;
  }

  function getUserId() {
    const params = new URLSearchParams(window.location.search || "");
    const queryUserId = cleanUserId(params.get("hero_chat_user_id") || params.get("test_user_id"));
    if (queryUserId) {
      try {
        window.localStorage?.setItem(STORAGE_KEY, queryUserId);
      } catch {
        // localStorage 不可用时只在当前页面使用 query id
      }
      return queryUserId;
    }

    try {
      const stored = cleanUserId(window.localStorage?.getItem(STORAGE_KEY));
      if (stored) return stored;
      const created = createVisitorId();
      window.localStorage?.setItem(STORAGE_KEY, created);
      return created;
    } catch {
      return createVisitorId();
    }
  }

  function withUserHeaders(init) {
    const nextInit = { ...(init || {}) };
    const headers = new Headers(nextInit.headers || {});
    if (!headers.has(USER_ID_HEADER)) {
      headers.set(USER_ID_HEADER, getUserId());
    }
    nextInit.headers = headers;
    return nextInit;
  }

  function fetchWithUser(input, init) {
    return fetch(input, withUserHeaders(init));
  }

  window.ChancePingBackendUser = {
    getUserId,
    withUserHeaders,
    fetch: fetchWithUser,
  };
})();
