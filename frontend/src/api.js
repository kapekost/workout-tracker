const base = '/api'

let unauthorizedHandler = null

// This module has no router and no business having one, so navigation is
// handed in instead of reached for. A single registered callback beats the two
// alternatives: `window.location = '/login'` would throw away the SPA and
// every bit of in-flight page state to say something the app already knows,
// and a window event would drag a DOM into api.test.js for no gain. The cost
// is that exactly one listener can be registered -- SessionProvider is it.
export function onUnauthorized(handler) {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null
  }
}

// FastAPI puts its message in `detail`, but 422s put a list of validation
// objects there instead. Only a plain string is a message worth showing.
async function errorDetail(res) {
  try {
    const body = await res.json()
    return typeof body?.detail === 'string' ? body.detail : null
  } catch {
    return null
  }
}

async function req(method, path, body) {
  // Cookies need no `credentials` option: the app and the API are same-origin,
  // so the browser sends `wt_session` by default.
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    // Everything under /auth/ answers 401 as a statement of fact rather than
    // as a failure: /auth/me is how the app asks whether anyone is logged in,
    // and the rest are the screens a logged-out person is meant to be standing
    // on -- a wrong password has to print its message, not bounce the screen
    // out from under whoever is typing it. A 401 from anywhere else means the
    // session ended mid-use.
    if (res.status === 401 && !path.startsWith('/auth/')) unauthorizedHandler?.()
    // The message keeps the status in it because callers already match on that
    // (PersonalBests reads 409 out of it). `status`/`detail` are the additions:
    // the auth endpoints answer with deliberately generic messages that the
    // login and set-password screens must show verbatim rather than reword.
    const err = new Error(`API ${method} ${path} → ${res.status}`)
    err.status = res.status
    err.detail = await errorDetail(res)
    throw err
  }
  // /api/auth/logout answers 204 with no body, which res.json() would reject on.
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b),
  patch: (p, b) => req('PATCH', p, b),
  delete: (p) => req('DELETE', p),
}

export const auth = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  setPassword: (token, password) => api.post('/auth/set-password', { token, password }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
}
