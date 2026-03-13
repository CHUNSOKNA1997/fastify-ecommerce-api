import { test } from 'node:test'
import * as assert from 'node:assert'
import { build } from '../helper'

function uniqueEmail(): string {
  return `user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`
}

test('register creates a user and returns access token', async (t) => {
  const app = await build(t)

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: uniqueEmail(),
      password: 'password123',
      confirmPassword: 'password123'
    }
  })

  assert.strictEqual(res.statusCode, 201)
  const body = res.json()
  assert.ok(body.accessToken)
  assert.ok(body.user.id)
})

test('register rejects duplicate email', async (t) => {
  const app = await build(t)
  const email = uniqueEmail()

  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: 'password123',
      confirmPassword: 'password123'
    }
  })

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: 'password123',
      confirmPassword: 'password123'
    }
  })

  assert.strictEqual(res.statusCode, 409)
})

test('register rejects mismatched confirm password', async (t) => {
  const app = await build(t)

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: uniqueEmail(),
      password: 'password123',
      confirmPassword: 'password124'
    }
  })

  assert.strictEqual(res.statusCode, 400)
})

test('login returns access token for valid credentials', async (t) => {
  const app = await build(t)
  const email = uniqueEmail()
  const password = 'password123'

  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password, confirmPassword: password }
  })

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password }
  })

  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.ok(body.accessToken)
  assert.strictEqual(body.user.email, email)
})

test('login rejects invalid credentials', async (t) => {
  const app = await build(t)
  const email = uniqueEmail()

  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: 'password123',
      confirmPassword: 'password123'
    }
  })

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email,
      password: 'wrongpass123'
    }
  })

  assert.strictEqual(res.statusCode, 401)
})

test('me requires valid bearer token', async (t) => {
  const app = await build(t)

  const noTokenRes = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me'
  })
  assert.strictEqual(noTokenRes.statusCode, 401)

  const email = uniqueEmail()
  const password = 'password123'

  const registerRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password, confirmPassword: password }
  })

  const token = registerRes.json().accessToken as string
  const meRes = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: {
      authorization: `Bearer ${token}`
    }
  })

  assert.strictEqual(meRes.statusCode, 200)
  assert.strictEqual(meRes.json().user.email, email)
})

test('logout invalidates current access token', async (t) => {
  const app = await build(t)
  const email = uniqueEmail()
  const password = 'password123'

  const registerRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password, confirmPassword: password }
  })

  const token = registerRes.json().accessToken as string
  const logoutRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/logout',
    headers: {
      authorization: `Bearer ${token}`
    }
  })

  assert.strictEqual(logoutRes.statusCode, 200)
  assert.strictEqual(logoutRes.json().message, 'Logged out successfully')

  const meAfterLogoutRes = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: {
      authorization: `Bearer ${token}`
    }
  })

  assert.strictEqual(meAfterLogoutRes.statusCode, 401)
})
