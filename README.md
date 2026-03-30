# Fastify Ecommerce API (Clean Baseline)
A minimal Fastify + TypeScript baseline ready for implementing the ecommerce API.

## Environment Variables

- `PORT=5000`
- `JWT_SECRET=replace-with-a-random-secret-32-characters-minimum` (at least 16 chars in dev/test, 32+ outside dev/test, and no known default secrets)
- `MONGODB_URI=mongodb://localhost:27017/flutter-ecommerce`
- `ACCESS_TOKEN_TTL=1h`
- `REFRESH_TOKEN_TTL_DAYS=30`
- `RESET_PASSWORD_TOKEN_TTL_MINUTES=15`
- `PAYWAY_MERCHANT_ID=your-payway-merchant-id`
- `PAYWAY_API_KEY=your-payway-api-key`
- `PAYWAY_PURCHASE_URL=https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase`
- `PAYWAY_CHECK_TRANSACTION_URL=https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/transaction-detail`
- `PAYWAY_RETURN_URL=https://your-domain/api/payments/return`
- `PAYWAY_CANCEL_URL=https://your-domain/api/payments/cancel`

## Available Scripts

In the project directory, you can run:

### `npm run dev`

To start the app in dev mode.\
The app reads `PORT` from `.env` (defaults to `5000` if missing).\
Open [http://localhost:5000](http://localhost:5000) to view it in the browser.

### `npm start`

For production mode. The server binds to `0.0.0.0` and reads runtime env vars directly, so it works in Docker/Render without a local `.env` file.

### `npm run test`

No tests are configured currently.

## Current Baseline

- App bootstrap with Fastify autoload (`src/app.ts`)
- API router (`src/routes/api.ts`) with version router (`src/api/v1/index.ts`)
- HTTP utilities plugin (`src/plugins/sensible.ts`)
- JWT auth plugin (`src/plugins/jwt.ts`)
- MongoDB plugin with Mongoose (`src/plugins/mongoose.ts`)

## Docker / Render

Build the image locally:

```bash
docker build -t fastify-ecommerce-api .
```

Run it:

```bash
docker run --rm -p 5000:5000 \
  -e PORT=5000 \
  -e MONGODB_URI='your-mongodb-uri' \
  -e JWT_SECRET='your-strong-secret' \
  fastify-ecommerce-api
```

On Render, create a new `Web Service`, choose `Docker`, and point it at this repo. Set these environment variables in Render:

- `MONGODB_URI`
- `JWT_SECRET`
- `ACCESS_TOKEN_TTL`
- `REFRESH_TOKEN_TTL_DAYS`
- `RESET_PASSWORD_TOKEN_TTL_MINUTES`

Render injects `PORT` automatically. The container starts with `dist/app.js` and listens on `0.0.0.0:$PORT`.

## Payments API (`/api/payments`)

- `POST /api/payments/create-checkout` - create a pending PayWay checkout session from `amount` and `orderId`
- `GET /api/payments/checkout/:paymentId` - serve the stored PayWay hosted checkout HTML
- `POST /api/payments/webhook` - verify the PayWay callback and update payment status
- `GET /api/payments/return` - browser return page for UX only
- `GET /api/payments/cancel` - browser cancel page for UX only

## Authentication API (`/api/v1/auth`)

- `POST /api/v1/auth/register` - create account and return access token (`firstName`, `lastName`, `email`, `password`, `confirmPassword`)
  - Validation: `email` must be valid format, password is 8-72 chars
- `POST /api/v1/auth/login` - authenticate and return access token + refresh token
- `POST /api/v1/auth/refresh` - rotate refresh token and issue new access/refresh pair
- `POST /api/v1/auth/forgot-password` - generate one-time password reset token (returned only outside production)
- `POST /api/v1/auth/reset-password` - reset password with valid token and invalidate existing sessions
- `GET /api/v1/auth/me` - get current user from bearer token
- `POST /api/v1/auth/logout` - protected endpoint that invalidates current access token and revokes refresh sessions

Auth users are persisted in MongoDB via Mongoose.
