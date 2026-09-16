# URide First Ride v0.7.0

## Nuevo en esta versión

- Passenger: mapa interactivo, GPS del teléfono, selección de recogida y destino tocando el mapa.
- Passenger: cálculo local inicial de distancia en millas y minutos para enviar una cotización al Pricing existente.
- Passenger: marcador del conductor cuando el backend reporta su ubicación.
- Driver: mapa con posición actual, recogida y destino.
- Driver: seguimiento GPS foreground cada ~5 segundos / 10 metros mientras está conectado.
- Backend existente continúa siendo la autoridad del estado del viaje.

## Probar en teléfono

1. Levanta PostgreSQL/Redis y API.
2. Configura EXPO_PUBLIC_API_URL con la IP LAN de la computadora, por ejemplo `http://192.168.1.20:3000`.
3. Ejecuta `npm install` en la raíz.
4. Ejecuta `npm run dev:passenger` o `npm run dev:driver`.
5. Abre el QR con Expo Go.
6. Autoriza ubicación cuando iOS/Android lo solicite.

## Nota

La distancia usada en esta foundation es línea recta (Haversine), no una ruta de calles. La siguiente integración de Maps/Directions debe reemplazarla con distancia y ETA de carretera provistas por el proveedor de rutas.
