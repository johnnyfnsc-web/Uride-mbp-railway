import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

type TripRealtimeEvent = {
  tripId: string;
  type: string;
  data?: Record<string, unknown>;
  at: string;
};

@Injectable()
export class RealtimeService {
  private readonly events$ = new Subject<TripRealtimeEvent>();

  publish(tripId: string, type: string, data: Record<string, unknown> = {}) {
    this.events$.next({ tripId, type, data, at: new Date().toISOString() });
  }

  stream(tripId: string): Observable<MessageEvent> {
    return this.events$.pipe(
      filter((event) => event.tripId === tripId),
      map((event) => ({ type: event.type, data: event } as MessageEvent)),
    );
  }
}
