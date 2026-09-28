(function (root, factory) {
  const mapData = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mapData;
  } else {
    root.KombiMapData = mapData;
  }
}(typeof globalThis === 'undefined' ? this : globalThis, function () {
  function connectionKey(from, to) {
    return [from, to].sort().join('|');
  }

  function createMapFeatures(data, path = []) {
    const stops = new Map(data.stops.map((stop) => [stop.id, stop]));
    const selectedStops = new Set(path);
    const selectedConnections = new Set(
      path.slice(1).map((id, index) => connectionKey(path[index], id)),
    );

    const connections = data.routes.map((route, index) => {
      const from = stops.get(route.from);
      const to = stops.get(route.to);
      if (!from || !to) {
        throw new Error(`Route connection ${index} references an unknown stop.`);
      }
      return {
        type: 'Feature',
        id: `connection-${index}`,
        properties: {
          from: route.from,
          to: route.to,
          selected: selectedConnections.has(connectionKey(route.from, route.to)),
        },
        geometry: {
          type: 'LineString',
          coordinates: [[from.lon, from.lat], [to.lon, to.lat]],
        },
      };
    });

    const points = data.stops.map((stop) => ({
      type: 'Feature',
      id: stop.id,
      properties: {
        id: stop.id,
        name: stop.name,
        selected: selectedStops.has(stop.id),
        endpoint: path.length > 0 && (stop.id === path[0] || stop.id === path[path.length - 1]),
      },
      geometry: {
        type: 'Point',
        coordinates: [stop.lon, stop.lat],
      },
    }));

    return {
      connections: { type: 'FeatureCollection', features: connections },
      stops: { type: 'FeatureCollection', features: points },
    };
  }

  return { createMapFeatures };
}));
