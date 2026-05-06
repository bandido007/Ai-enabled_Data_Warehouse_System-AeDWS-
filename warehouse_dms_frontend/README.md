# Warehouse DMS Frontend

React + TypeScript + Vite frontend for Phase 5 of the Warehouse DMS project.

## Prerequisites

- Node.js 22+
- pnpm 9+
- Django backend running on `http://localhost:8000`

## Frontend setup

From the project root:

```bash
cd warehouse_dms_frontend
pnpm install
```

## Start the frontend

```bash
cd warehouse_dms_frontend
pnpm dev
```

Default local URL:

- `http://localhost:5173`
- If that port is busy, Vite automatically picks the next one, for example `http://localhost:5174`

## Important commands

### Development server

```bash
pnpm dev
```

### Type-check the app

```bash
pnpm typecheck
```

### Lint the code

```bash
pnpm lint
```

### Build for production

```bash
pnpm build
```

### Preview the production build locally

```bash
pnpm preview
```

## Backend command you will usually need too

From the backend folder:

```bash
cd warehouse_dms
docker compose up -d
```

If you need to stop backend services:

```bash
cd warehouse_dms
docker compose down
```

## Environment

Local frontend environment is stored in `.env.local`:

```env
VITE_API_URL=http://localhost:8000/api/v1
```

## Typical startup flow

Open terminal 1:

```bash
cd warehouse_dms
docker compose up -d
```

Open terminal 2:

```bash
cd warehouse_dms_frontend
pnpm dev
```

## Notes

- The frontend proxies `/api` and `/media` requests to the Django backend during development.
- Login for local testing depends on seeded backend users.
- Recommended validation before committing:

```bash
pnpm lint && pnpm typecheck && pnpm build
```
