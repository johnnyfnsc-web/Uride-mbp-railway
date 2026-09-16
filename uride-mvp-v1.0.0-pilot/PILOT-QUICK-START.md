# URide MVP v1.0 — Primer viaje piloto local

## En una computadora
1. Instala Docker Desktop y Node.js 22+.
2. Descomprime este proyecto.
3. En Terminal entra a la carpeta del proyecto.
4. Ejecuta:
   `cp .env.pilot.local.example .env`
5. Abre `.env` y reemplaza:
   - `PILOT_PASSENGER_PASSWORD`
   - `PILOT_DRIVER_PASSWORD`
   - `PILOT_ADMIN_PASSWORD`
   - `JWT_ACCESS_SECRET`
6. Ejecuta:
   `npm run pilot:setup`
7. Cuando termine, abre otra Terminal y ejecuta:
   `npm run dev:api`
8. En otra Terminal, carga `.env` y ejecuta:
   `set -a; source .env; set +a; npm run pilot:first-ride`

El runner inicia sesión como Passenger y Driver, conecta al Driver, crea un viaje, genera una oferta, acepta, llega, inicia, cambia el destino, completa y vuelve a leer el mismo viaje.

## Stripe
El primer smoke local puede completarse sin cobrar. Para PaymentSheet/Stripe:
- añade credenciales Stripe TEST a `.env`;
- configura el webhook de Stripe hacia tu API;
- luego ejecuta el runner `npm run test:live` y las pruebas en los teléfonos.

## Importante
`pilot:setup` usa `prisma db push` solamente para una base LOCAL de prueba. Antes de un piloto externo debes generar/aplicar migraciones Prisma reales con historial de migraciones.
