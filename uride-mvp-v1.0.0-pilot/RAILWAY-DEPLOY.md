# URide MVP v1.0.0 — Railway package

This package is based on `uride-mvp-v1.0.0-pilot-setup.zip` and includes Railway deployment configuration for the NestJS API.

## Railway services
1. Create a Railway project from this repository/package.
2. Add a PostgreSQL database to the same Railway project.
3. Deploy the URide service. Railway supplies `PORT`; PostgreSQL should supply `DATABASE_URL` through a service reference/variable.

## Required production variables
- `NODE_ENV=production`
- `DATABASE_URL` (Railway PostgreSQL connection string)
- `JWT_ACCESS_SECRET` (at least 32 random characters)
- `JWT_REFRESH_SECRET` (use a strong random secret)
- `ROUTING_BASE_URL` (production routing provider URL)
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Optional/feature variables
See `.env.example` for Redis, Expo notifications, dispatch/notification workers, Stripe Connect, risk thresholds, commission rate, and AI settings.

## Deployment behavior
`railway.toml` installs dependencies, generates Prisma Client, builds the NestJS API, synchronizes the current Prisma schema to PostgreSQL before deployment, and starts the compiled API.

Note: the historical migration files in this project are reference/documentation migrations rather than a complete executable migration history. For this pilot package, Railway uses `prisma db push` to initialize/synchronize a fresh pilot database. Before a mature production rollout with persistent customer data, create and adopt a proper baseline Prisma migration history.
