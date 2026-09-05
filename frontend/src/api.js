const base = '/api'

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
