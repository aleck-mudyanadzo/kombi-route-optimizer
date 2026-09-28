(function (root, factory) {
  const router = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = router;
  } else {
    root.KombiRouter = router;
  }
}(typeof globalThis === 'undefined' ? this : globalThis, function () {
  const EARTH_RADIUS_KM = 6371;
  const WEIGHTS = ['distance_km', 'fare_usd', 'time_min'];

  function haversineKm(from, to) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const latitudeDelta = radians(to.lat - from.lat);
    const longitudeDelta = radians(to.lon - from.lon);
    const latitudeFrom = radians(from.lat);
    const latitudeTo = radians(to.lat);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(latitudeFrom) * Math.cos(latitudeTo) * Math.sin(longitudeDelta / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
  }

  function createMinHeap() {
    const items = [];
    return {
      push(item) {
        items.push(item);
        let index = items.length - 1;
        while (index > 0) {
          const parent = Math.floor((index - 1) / 2);
          if (items[parent].priority <= item.priority) break;
          items[index] = items[parent];
          index = parent;
        }
        items[index] = item;
      },
      pop() {
        if (items.length === 0) return undefined;
        const first = items[0];
        const last = items.pop();
        if (items.length > 0) {
          let index = 0;
          while (true) {
            const left = index * 2 + 1;
            const right = left + 1;
            if (left >= items.length) break;
            const child = right < items.length && items[right].priority < items[left].priority
              ? right
              : left;
            if (items[child].priority >= last.priority) break;
            items[index] = items[child];
            index = child;
          }
          items[index] = last;
        }
        return first;
      },
      get length() {
        return items.length;
      },
    };
  }

  function findRoute(data, start, goal, weightKey, algorithm) {
    if (!WEIGHTS.includes(weightKey)) {
      throw new Error(`Unknown route weight: ${weightKey}`);
    }
    if (!['dijkstra', 'astar'].includes(algorithm)) {
      throw new Error(`Unknown algorithm: ${algorithm}`);
    }
    if (algorithm === 'astar' && weightKey !== 'distance_km') {
      throw new Error('A* is only supported for distance_km routing.');
    }

    const stops = new Map(data.stops.map((stop) => [stop.id, stop]));
    if (!stops.has(start) || !stops.has(goal)) {
      throw new Error('Unknown stop id.');
    }

    const adjacency = new Map(data.stops.map((stop) => [stop.id, []]));
    data.routes.forEach((route) => {
      adjacency.get(route.from).push({ to: route.to, route });
      adjacency.get(route.to).push({ to: route.from, route });
    });

    const distances = new Map(data.stops.map((stop) => [stop.id, Infinity]));
    const previous = new Map();
    const visited = new Set();
    const queue = createMinHeap();
    const heuristic = (id) => algorithm === 'astar' ? haversineKm(stops.get(id), stops.get(goal)) : 0;
    distances.set(start, 0);
    queue.push({ id: start, priority: heuristic(start) });

    while (queue.length > 0) {
      const current = queue.pop().id;
      if (visited.has(current)) continue;
      visited.add(current);
      if (current === goal) break;

      adjacency.get(current).forEach(({ to, route }) => {
        const candidate = distances.get(current) + route[weightKey];
        if (candidate < distances.get(to)) {
          distances.set(to, candidate);
          previous.set(to, current);
          queue.push({ id: to, priority: candidate + heuristic(to) });
        }
      });
    }

    if (!Number.isFinite(distances.get(goal))) return null;
    const path = [goal];
    while (path[0] !== start) {
      const parent = previous.get(path[0]);
      if (!parent) return null;
      path.unshift(parent);
    }

    const totals = { distance_km: 0, fare_usd: 0, time_min: 0 };
    for (let index = 0; index < path.length - 1; index += 1) {
      const edge = adjacency.get(path[index]).find(({ to }) => to === path[index + 1]);
      WEIGHTS.forEach((weight) => {
        totals[weight] += edge.route[weight];
      });
    }
    return { path, total: distances.get(goal), totals };
  }

  return { findRoute };
}));
