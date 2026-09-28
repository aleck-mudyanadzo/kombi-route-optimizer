const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { findRoute } = require('./router.js');

const data = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data', 'gweru_routes.json'),
  'utf8',
));

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
