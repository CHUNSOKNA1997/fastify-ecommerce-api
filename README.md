# Fastify Ecommerce API (Clean Baseline)
A minimal Fastify + TypeScript baseline ready for implementing the ecommerce API.

## Environment Variables

- `PORT=5000`
- `JWT_SECRET=replace-with-a-random-secret-32-characters-minimum` (at least 16 chars in dev/test, 32+ outside dev/test, and no known default secrets)
- `MONGODB_URI=mongodb://localhost:27017/flutter-ecommerce`
- `ACCESS_TOKEN_TTL=1h`
- `REFRESH_TOKEN_TTL_DAYS=30`

## Available Scripts

In the project directory, you can run:

### `npm run dev`

To start the app in dev mode.\
The app reads `PORT` from `.env` (defaults to `5000` if missing).\
Open [http://localhost:5000](http://localhost:5000) to view it in the browser.

### `npm start`

For production mode (also uses `.env` `PORT`).

### `npm run test`

No tests are configured currently.

## Current Baseline

- App bootstrap with Fastify autoload (`src/app.ts`)
- API router (`src/routes/api.ts`) with version router (`src/api/v1/index.ts`)
- HTTP utilities plugin (`src/plugins/sensible.ts`)
- JWT auth plugin (`src/plugins/jwt.ts`)
- MongoDB plugin with Mongoose (`src/plugins/mongoose.ts`)

## Authentication API (`/api/v1/auth`)

- `POST /api/v1/auth/register` - create account and return access token (`firstName`, `lastName`, `email`, `password`, `confirmPassword`)
  - Validation: `email` must be valid format, password is 8-72 chars
- `POST /api/v1/auth/login` - authenticate and return access token + refresh token
- `POST /api/v1/auth/refresh` - rotate refresh token and issue new access/refresh pair
- `GET /api/v1/auth/me` - get current user from bearer token
- `POST /api/v1/auth/logout` - protected endpoint that invalidates current access token and revokes refresh sessions

Auth users are persisted in MongoDB via Mongoose.
