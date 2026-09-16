import { BadRequestException, Injectable } from '@nestjs/common';

type Point = { lat: number; lng: number };
type RouteStep = {
  instruction: string;
  distanceMiles: number;
  durationMinutes: number;
  location: { latitude: number; longitude: number };
};
type RouteResult = {
  provider: string;
  distanceMiles: number;
  durationMinutes: number;
  geometry: Array<{ latitude: number; longitude: number }>;
  steps: RouteStep[];
};

@Injectable()
export class RoutingService {
  private validate(point: Point, name: string) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      throw new BadRequestException(`${name} coordinates are required`);
    }
  }

  private haversineMiles(a: Point, b: Point) {
    const r = 3958.7613;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(x));
  }

  private instructionFor(step: any) {
    const maneuver = step?.maneuver || {};
    const type = String(maneuver.type || 'continue');
    const modifier = String(maneuver.modifier || '').replaceAll('_', ' ');
    const road = String(step?.name || '').trim();
    if (type === 'arrive') return 'Llegaste al destino';
    if (type === 'depart') return road ? `Sal por ${road}` : 'Comienza la ruta';
    if (type === 'turn') return `Gira${modifier ? ` ${modifier}` : ''}${road ? ` hacia ${road}` : ''}`;
    if (type === 'roundabout' || type === 'rotary') return road ? `Toma la rotonda hacia ${road}` : 'Entra en la rotonda';
    if (type === 'merge') return road ? `Incorpórate a ${road}` : 'Incorpórate';
    if (type === 'fork') return `Mantente${modifier ? ` ${modifier}` : ''}${road ? ` hacia ${road}` : ''}`;
    if (type === 'new name') return road ? `Continúa por ${road}` : 'Continúa recto';
    return road ? `Continúa por ${road}` : 'Continúa en la ruta';
  }

  private fallback(origin: Point, destination: Point): RouteResult {
    const straight = this.haversineMiles(origin, destination);
    const distanceMiles = Math.max(0.1, straight * 1.22);
    const durationMinutes = Math.max(2, Math.round((distanceMiles / 24) * 60));
    return {
      provider: 'FALLBACK',
      distanceMiles: Number(distanceMiles.toFixed(2)),
      durationMinutes,
      geometry: [
        { latitude: origin.lat, longitude: origin.lng },
        { latitude: destination.lat, longitude: destination.lng },
      ],
      steps: [{
        instruction: 'Continúa hacia el destino',
        distanceMiles: Number(distanceMiles.toFixed(2)),
        durationMinutes,
        location: { latitude: destination.lat, longitude: destination.lng },
      }],
    };
  }

  async route(origin: Point, destination: Point): Promise<RouteResult> {
    this.validate(origin, 'origin');
    this.validate(destination, 'destination');
    const baseUrl = process.env.ROUTING_BASE_URL; if(!baseUrl) throw new Error('ROUTING_BASE_URL is required');
    try {
      const url = `${baseUrl}/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!response.ok) return this.fallback(origin, destination);
      const body: any = await response.json();
      const route = body?.routes?.[0];
      if (!route?.geometry?.coordinates?.length) return this.fallback(origin, destination);
      const steps = (route?.legs || []).flatMap((leg: any) => leg?.steps || []).map((step: any) => {
        const [lng, lat] = step?.maneuver?.location || [destination.lng, destination.lat];
        return {
          instruction: this.instructionFor(step),
          distanceMiles: Number((Number(step?.distance || 0) / 1609.344).toFixed(2)),
          durationMinutes: Math.max(1, Math.round(Number(step?.duration || 0) / 60)),
          location: { latitude: lat, longitude: lng },
        };
      });
      return {
        provider: 'ROUTING_PROVIDER',
        distanceMiles: Number((Number(route.distance) / 1609.344).toFixed(2)),
        durationMinutes: Math.max(1, Math.round(Number(route.duration) / 60)),
        geometry: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ latitude: lat, longitude: lng })),
        steps,
      };
    } catch {
      return this.fallback(origin, destination);
    }
  }
}
