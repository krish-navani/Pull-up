import { strict as assert } from 'node:assert';
import { getAuthoritativeRoute } from './fareRouteService.js';

process.env.GOOGLE_MAPS_API_KEY = 'test-key';

const makeDb = () => {
  const writes: any[] = [];
  const db: any = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false }),
        set: async (value: any) => { writes.push(value); },
      }),
    }),
  };
  return { db, writes };
};

const run = async () => {
const originalFetch = globalThis.fetch;
try {
  {
    const { db, writes } = makeDb();
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'https://routes.googleapis.com/directions/v2:computeRoutes');
      assert.equal(init?.method, 'POST');
      assert.match(String((init?.headers as Record<string, string>)?.['X-Goog-FieldMask']), /routes\.distanceMeters/);
      return new Response(JSON.stringify({
        routes: [{
          distanceMeters: 18770,
          duration: '2100s',
          polyline: { encodedPolyline: 'encoded-road-route' },
          optimizedIntermediateWaypointIndex: [],
        }],
      }), { status: 200 });
    };
    const route = await getAuthoritativeRoute(db, { latitude: 19, longitude: 72.8 }, { latitude: 19.07, longitude: 72.87 });
    assert.equal(route.distanceMeters, 18770);
    assert.equal(route.durationSeconds, 2100);
    assert.equal(route.provider, 'google');
    assert.equal(writes.length, 1, 'successful routes are cached');
  }

  {
    const { db, writes } = makeDb();
    globalThis.fetch = async () => new Response(JSON.stringify({ routes: [] }), { status: 200 });
    await assert.rejects(
      () => getAuthoritativeRoute(db, { latitude: 19, longitude: 72.8 }, { latitude: 19.07, longitude: 72.87 }),
      /NO_ROUTE_FOUND/,
    );
    assert.equal(writes.length, 0, 'failed routes must never be cached');
  }

  {
    const { db, writes } = makeDb();
    globalThis.fetch = async () => { throw new Error('network down'); };
    await assert.rejects(
      () => getAuthoritativeRoute(db, { latitude: 19, longitude: 72.8 }, { latitude: 19.07, longitude: 72.87 }),
      /ROUTE_PROVIDER_UNAVAILABLE/,
    );
    assert.equal(writes.length, 0);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('fareRouteService tests passed');
};
run().catch(error => { console.error(error); process.exitCode = 1; });