# Fastify Ecommerce API (Clean Baseline)
A minimal Fastify + TypeScript baseline ready for implementing the ecommerce API.

## Environment Variables

- `PORT=5000`
- `JWT_SECRET=change-me-in-production`
- `MONGODB_URI=mongodb://localhost:27017/flutter-ecommerce`

## Available Scripts

In the project directory, you can run:

### `npm run dev`

To start the app in dev mode.\
The app reads `PORT` from `.env` (defaults to `5000` if missing).\
Open [http://localhost:5000](http://localhost:5000) to view it in the browser.

### `npm start`

For production mode (also uses `.env` `PORT`).

### `npm run test`

Run the test cases.

## Current Baseline

- App bootstrap with Fastify autoload (`src/app.ts`)
- Root route (`src/routes/root.ts`)
- API router (`src/routes/api.ts`) with version router (`src/api/v1/index.ts`)
- HTTP utilities plugin (`src/plugins/sensible.ts`)
- JWT auth plugin (`src/plugins/jwt.ts`)
- MongoDB plugin with Mongoose (`src/plugins/mongoose.ts`)

## Authentication API (`/api/v1/auth`)

- `POST /api/v1/auth/register` - create account and return access token
- `POST /api/v1/auth/login` - authenticate and return access token
- `GET /api/v1/auth/me` - get current user from bearer token
- `POST /api/v1/auth/logout` - protected endpoint for client-side logout flow

Auth users are persisted in MongoDB via Mongoose.
