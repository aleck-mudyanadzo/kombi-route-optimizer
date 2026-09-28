const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { findRoute } = require('./router.js');

const frontendHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const frontendScript = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
const frontendCss = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
const data = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data', 'gweru_routes.json'),
  'utf8',
));
const { createMapFeatures } = require('./map-data.js');

test('keeps public page copy clear of hyphens and preserves the route estimate disclaimer', () => {
  const visibleText = frontendHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');
  const metadataText = [...frontendHtml.matchAll(
    /<meta\s+(?:name|property)="(?:description|og:title|og:description|twitter:title|twitter:description)"\s+content="([^"]*)"/gi,
  )]
    .map(([, content]) => content)
    .join(' ');
  const statusText = [...frontendScript.matchAll(
    /message\.textContent\s*=\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g,
  )]
    .map(([, singleQuoted, doubleQuoted, template]) => singleQuoted || doubleQuoted || template)
    .join(' ');

  assert.doesNotMatch(`${visibleText} ${metadataText} ${statusText}`, /[-\u2010-\u2015]/);
  assert.match(
    frontendHtml,
    /distances, fares, and travel times are estimates, not live transit information\./,
  );
  assert.match(frontendHtml, /id="message" class="status" role="status" aria-live="polite"/);
  assert.match(frontendHtml, /Current USD fare amounts are not verified prices from local operators/);
  assert.equal(data.fare_data.status, 'mixed');
  assert.match(data.fare_data.note, /not been independently verified/);
  assert.equal(data.fare_market_reference.used_for_route_weights, false);
  assert.deepEqual(data.fare_market_reference.reported_range_per_trip, [0.75, 1]);
  assert.match(frontendHtml, /A user reported a US\$0\.50 fare for the MSU Main Campus to Gweru CBD trip/);
  assert.match(frontendHtml, /The Herald reported/);
});

test('uses an attributed OpenFreeMap street map with accessible 2D and 3D controls', () => {
  assert.match(frontendHtml, /maplibre-gl@4\.7\.1\/dist\/maplibre-gl\.css/);
  assert.match(frontendHtml, /maplibre-gl@4\.7\.1\/dist\/maplibre-gl\.js/);
  assert.match(frontendScript, /https:\/\/tiles\.openfreemap\.org\/styles\/positron/);
  assert.match(frontendScript, /fill-extrusion/);
  assert.match(frontendHtml, /id="map2d" type="button" aria-pressed="true" disabled>2D/);
  assert.match(frontendHtml, /id="map3d" type="button" aria-pressed="false" disabled>3D buildings/);
  assert.match(frontendHtml, /OpenStreetMap contributors/);
  assert.match(frontendHtml, /OpenFreeMap/);
  assert.match(frontendHtml, /Dashed links are illustrative model connections, not official kombi lines/);
  assert.match(frontendHtml, /id="mapStatus" class="map-status" role="status" aria-live="polite"/);
  assert.match(frontendScript, /Some map data could not be loaded/);
  assert.match(frontendScript, /route planning still works/);
  assert.doesNotMatch(frontendHtml, /vis-network/);
});

test('keeps the route and map presentation accessible and responsive', () => {
  assert.match(frontendHtml, /id="routePath" class="route-path" aria-label="Stops along your route"/);
  assert.match(frontendHtml, /id="network" role="region" aria-label="Interactive map of Gweru streets, buildings, stops, and model connections"/);
  assert.match(frontendScript, /routePath\.replaceChildren\(\)/);
  assert.match(frontendScript, /stop\.textContent = routeData\.stops\.find/);
  assert.doesNotMatch(frontendScript, /routePath\.innerHTML/);
  assert.match(frontendCss, /button:focus-visible/);
  assert.match(frontendCss, /@media \(max-width: 640px\)/);
  assert.match(frontendCss, /prefers-reduced-motion: reduce/);
  assert.match(frontendHtml, /aria-describedby="mapDescription"/);
});

test('builds GeoJSON model connections from the supplied stop coordinates', () => {
  const mapFeatures = createMapFeatures(data, ['town', 'kudzanai', 'mkoba1']);
  assert.equal(mapFeatures.connections.features.length, data.routes.length);
  assert.equal(mapFeatures.stops.features.length, data.stops.length);

  const selected = mapFeatures.connections.features.find(
    (feature) => feature.properties.from === 'town' && feature.properties.to === 'kudzanai',
  );
  assert.equal(selected.properties.selected, true);
  assert.deepEqual(selected.geometry.coordinates, [
    [data.stops.find((stop) => stop.id === 'town').lon, data.stops.find((stop) => stop.id === 'town').lat],
    [data.stops.find((stop) => stop.id === 'kudzanai').lon, data.stops.find((stop) => stop.id === 'kudzanai').lat],
  ]);
  assert.equal(
    mapFeatures.stops.features.find((feature) => feature.properties.id === 'town').properties.endpoint,
    true,
  );
  assert.equal(
    mapFeatures.stops.features.find((feature) => feature.properties.id === 'kudzanai').properties.endpoint,
    false,
  );

  const reverse = createMapFeatures(data, ['kudzanai', 'town']);
  assert.equal(
    reverse.connections.features.find((feature) => feature.properties.from === 'town').properties.selected,
    true,
  );
});

test('uses and discloses the user reported CBD to MSU fare without relabeling other estimates', () => {
  const result = findRoute(data, 'town', 'msu_main', 'fare_usd', 'dijkstra');
  assert.deepEqual(result.path, ['town', 'msu_main']);
  assert.equal(result.total, 0.5);
  assert.equal(result.totals.distance_km, null);
  assert.equal(result.totals.time_min, null);
  assert.equal(result.fareStatus, 'reported');
  assert.equal(result.fareEvidence[0].source, 'User reported');
  assert.match(frontendScript, /result\.fareStatus === 'reported'/);
  assert.match(frontendScript, /so it is not considered in this route objective/);
  assert.match(frontendScript, /Distance and time were not supplied/);
  assert.match(frontendHtml, /id="statFareLabel">Estimated fare/);
  assert.match(frontendHtml, /id="fareNote" class="fare-note" role="note"/);

  const direct = data.routes.find((route) => route.from === 'town' && route.to === 'msu_main');
  assert.equal(direct.fare_usd, 0.5);
  assert.deepEqual(direct.fare_evidence, {
    source: 'User reported',
    reported_on: '2026-09-28',
    currency: 'USD',
    effective_from: null,
    independently_verified: false,
    directional_scope: 'The report describes the MSU Main Campus to Gweru CBD trip. The graph applies it in both directions because graph connections are undirected.',
  });
  const estimates = data.routes.filter((route) => route !== direct);
  assert.ok(estimates.every((route) => route.fare_evidence === undefined));
  assert.match(direct.distance_time_note, /not recorded/);

  const estimated = findRoute(data, 'town', 'kudzanai', 'fare_usd', 'dijkstra');
  assert.equal(estimated.fareStatus, 'estimate');
  assert.deepEqual(
    findRoute(data, 'town', 'msu_main', 'distance_km', 'dijkstra').path,
    ['town', 'kudzanai', 'msu_main'],
  );
  assert.equal(
    findRoute(data, 'town', 'msu_main', 'distance_km', 'dijkstra').totals.fare_usd,
    2,
  );
  const mixedData = {
    stops: [
      data.stops.find((stop) => stop.id === 'town'),
      data.stops.find((stop) => stop.id === 'msu_main'),
      { id: 'sample', name: 'Sample stop', lat: -19.47, lon: 29.82 },
    ],
    routes: [
      direct,
      { from: 'msu_main', to: 'sample', distance_km: 1, fare_usd: 0.5, time_min: 2 },
    ],
  };
  const mixed = findRoute(mixedData, 'town', 'sample', 'fare_usd', 'dijkstra');
  assert.equal(mixed.fareStatus, 'mixed');
  assert.equal(mixed.fareEvidence.length, 1);
});

test('finds shortest routes using distance, fare, and time weights', () => {
  const route = findRoute(data, 'town', 'msu_main', 'distance_km', 'dijkstra');
  assert.equal(route.path[0], 'town');
  assert.equal(route.path.at(-1), 'msu_main');
  assert.equal(route.total, route.totals.distance_km);

  for (const weight of ['distance_km', 'fare_usd', 'time_min']) {
    const result = findRoute(data, 'town', 'guinea_fowl', weight, 'dijkstra');
    assert.ok(result);
    assert.ok(result.total > 0);
  }
});

test('A* matches Dijkstra for every pair of stops using distance', () => {
  data.stops.forEach((from) => {
    data.stops.forEach((to) => {
      const dijkstra = findRoute(data, from.id, to.id, 'distance_km', 'dijkstra');
      const astar = findRoute(data, from.id, to.id, 'distance_km', 'astar');
      assert.equal(astar.total, dijkstra.total, `${from.id} -> ${to.id}`);
    });
  });
});

test('supports same-stop paths and rejects unsupported optimization combinations', () => {
  assert.deepEqual(
    findRoute(data, 'town', 'town', 'distance_km', 'dijkstra').path,
    ['town'],
  );
  assert.throws(() => findRoute(data, 'town', 'msu_main', 'time_min', 'astar'), /A\* is only supported/);
  assert.throws(() => findRoute(data, 'unknown', 'town', 'distance_km', 'dijkstra'), /Unknown stop/);
});
