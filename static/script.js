let routeData;
let map;
let mapReady = false;
let buildingLayerAvailable = false;

const CONNECTIONS_SOURCE = 'model-connections';
const STOPS_SOURCE = 'route-stops';
const BUILDINGS_3D_LAYER = 'openfreemap-buildings-3d';

const weightForMode = {
  cheapest: 'fare_usd',
  fastest: 'time_min',
  shortest: 'distance_km',
};

async function loadRoutes() {
  const message = document.getElementById('message');
  try {
    const response = await fetch(new URL('./data/gweru_routes.json', document.baseURI));
    if (!response.ok) {
      throw new Error(`Could not load route data (${response.status}).`);
    }
    routeData = await response.json();

    const fromSelect = document.getElementById('from');
    const toSelect = document.getElementById('to');
    routeData.stops.forEach((stop) => {
      fromSelect.add(new Option(stop.name, stop.id));
      toSelect.add(new Option(stop.name, stop.id));
    });
    fromSelect.value = 'town';
    toSelect.value = 'msu_main';

    initializeMap();
    document.getElementById('findBtn').disabled = false;
    message.textContent = 'Choose two stops to find a route.';
  } catch (error) {
    message.textContent = `Unable to start the route finder: ${error.message}`;
  }
}

function setMapStatus(message) {
  const status = document.getElementById('mapStatus');
  status.textContent = message;
  status.hidden = !message;
}

function firstSymbolLayerId() {
  return map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
}

function addMapOverlays() {
  const features = KombiMapData.createMapFeatures(routeData);
  const style = map.getStyle();
  const buildingLayer = style.layers.find((layer) => (
    layer.type === 'fill'
    && layer['source-layer'] === 'building'
    && layer.source
  ));
  const beforeSymbol = firstSymbolLayerId();

  map.addSource(CONNECTIONS_SOURCE, { type: 'geojson', data: features.connections });
  map.addLayer({
    id: 'model-connections-line',
    type: 'line',
    source: CONNECTIONS_SOURCE,
    filter: ['==', ['get', 'selected'], false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#a65e3c',
      'line-width': 1.5,
      'line-opacity': 0.58,
      'line-dasharray': [2, 2],
    },
  }, beforeSymbol);
  map.addLayer({
    id: 'selected-model-connections-line',
    type: 'line',
    source: CONNECTIONS_SOURCE,
    filter: ['==', ['get', 'selected'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#70283f',
      'line-width': 4,
      'line-opacity': 0.95,
    },
  }, beforeSymbol);

  map.addSource(STOPS_SOURCE, { type: 'geojson', data: features.stops });
  map.addLayer({
    id: 'route-stop-circles',
    type: 'circle',
    source: STOPS_SOURCE,
    paint: {
      'circle-radius': ['case', ['get', 'endpoint'], 8, ['get', 'selected'], 7, 5],
      'circle-color': ['case', ['get', 'selected'], '#70283f', '#a65e3c'],
      'circle-stroke-color': '#fffdf8',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: 'route-stop-labels',
    type: 'symbol',
    source: STOPS_SOURCE,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Regular'],
      'text-size': 11,
      'text-offset': [0, 1.25],
      'text-anchor': 'top',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#382a28',
      'text-halo-color': '#fffdf8',
      'text-halo-width': 1.5,
    },
  });

  buildingLayerAvailable = Boolean(buildingLayer);
  const perspectiveButtons = [
    document.getElementById('map2d'),
    document.getElementById('map3d'),
  ];
  perspectiveButtons[0].disabled = false;
  perspectiveButtons[1].disabled = !buildingLayerAvailable;

  if (buildingLayerAvailable) {
    const height = ['coalesce', ['to-number', ['get', 'render_height']], ['to-number', ['get', 'height']], 7];
    const minHeight = ['coalesce', ['to-number', ['get', 'render_min_height']], ['to-number', ['get', 'min_height']], 0];
    map.addLayer({
      id: BUILDINGS_3D_LAYER,
      type: 'fill-extrusion',
      source: buildingLayer.source,
      'source-layer': buildingLayer['source-layer'],
      minzoom: buildingLayer.minzoom || 12,
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': '#c6a17d',
        'fill-extrusion-height': height,
        'fill-extrusion-base': minHeight,
        'fill-extrusion-opacity': 0.88,
      },
    }, 'model-connections-line');
  } else {
    setMapStatus('The street map loaded, but this map style has no building footprints for 3D. Stops and route planning remain available.');
  }

  const bounds = new maplibregl.LngLatBounds();
  routeData.stops.forEach((stop) => bounds.extend([stop.lon, stop.lat]));
  map.fitBounds(bounds, { padding: 48, maxZoom: 12.5, duration: 0 });
  mapReady = true;
  if (buildingLayerAvailable) setMapStatus('');
}

function initializeMap() {
  if (!globalThis.maplibregl) {
    setMapStatus('The street map library could not be loaded. Route planning still works; choose stops above.');
    return;
  }

  try {
    map = new maplibregl.Map({
      container: 'network',
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [29.817, -19.416],
      zoom: 11,
      attributionControl: false,
      cooperativeGestures: true,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      try {
        addMapOverlays();
      } catch (error) {
        setMapStatus(`The street map could not be prepared: ${error.message} Route planning still works.`);
      }
    });
    map.on('error', () => {
      setMapStatus('Some map data could not be loaded. Street or building detail may be incomplete; route planning still works.');
    });
  } catch (error) {
    setMapStatus(`The street map could not be started: ${error.message} Route planning still works.`);
  }

  document.getElementById('map2d').addEventListener('click', () => setMapPerspective('2d'));
  document.getElementById('map3d').addEventListener('click', () => setMapPerspective('3d'));
}

function setMapPerspective(perspective) {
  if (!mapReady || (perspective === '3d' && !buildingLayerAvailable)) return;
  const is3d = perspective === '3d';
  if (buildingLayerAvailable) {
    map.setLayoutProperty(BUILDINGS_3D_LAYER, 'visibility', is3d ? 'visible' : 'none');
  }
  document.getElementById('map2d').setAttribute('aria-pressed', String(!is3d));
  document.getElementById('map3d').setAttribute('aria-pressed', String(is3d));
  map.easeTo({
    pitch: is3d ? 55 : 0,
    bearing: is3d ? -15 : 0,
    zoom: is3d ? Math.max(map.getZoom(), 13) : map.getZoom(),
    duration: 350,
  });
}

function highlightPath(path) {
  if (!mapReady) return;
  const data = KombiMapData.createMapFeatures(routeData, path);
  map.getSource(CONNECTIONS_SOURCE).setData(data.connections);
  map.getSource(STOPS_SOURCE).setData(data.stops);

  const bounds = new maplibregl.LngLatBounds();
  path.forEach((id) => {
    const stop = routeData.stops.find((item) => item.id === id);
    bounds.extend([stop.lon, stop.lat]);
  });
  map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 500 });
}

function findRoute() {
  const start = document.getElementById('from').value;
  const goal = document.getElementById('to').value;
  const mode = document.getElementById('mode').value;
  const algorithm = document.getElementById('algo').value;
  const message = document.getElementById('message');

  if (start === goal) {
    message.textContent = 'Pick two different stops.';
    return;
  }
  if (!Object.hasOwn(weightForMode, mode)) {
    message.textContent = 'Choose a valid route optimization mode.';
    return;
  }
  if (!['dijkstra', 'astar'].includes(algorithm)) {
    message.textContent = 'Choose Dijkstra or A*.';
    return;
  }
  if (algorithm === 'astar' && mode !== 'shortest') {
    message.textContent = 'A* is only supported for the shortest route. Choose Dijkstra for fare or time.';
    return;
  }

  const result = KombiRouter.findRoute(routeData, start, goal, weightForMode[mode], algorithm);
  if (!result) {
    message.textContent = 'No route found between these stops.';
    return;
  }

  message.textContent = '';
  document.getElementById('result').classList.remove('hidden');
  const routePath = document.getElementById('routePath');
  routePath.replaceChildren();
  result.path.forEach((id, index) => {
    if (index > 0) {
      const connector = document.createElement('span');
      connector.className = 'route-connector';
      connector.setAttribute('aria-hidden', 'true');
      connector.textContent = '→';
      routePath.append(connector);
    }
    const stop = document.createElement('span');
    stop.className = 'route-stop';
    stop.textContent = routeData.stops.find((item) => item.id === id).name;
    routePath.append(stop);
  });
  const statDistance = document.getElementById('statDistance');
  const statDistanceUnit = document.getElementById('statDistanceUnit');
  const statTime = document.getElementById('statTime');
  const statTimeUnit = document.getElementById('statTimeUnit');
  statDistance.textContent = Number.isFinite(result.totals.distance_km)
    ? result.totals.distance_km.toFixed(2)
    : 'Not recorded';
  statDistanceUnit.textContent = Number.isFinite(result.totals.distance_km) ? 'km' : '';
  document.getElementById('statFare').textContent = `$${result.totals.fare_usd.toFixed(2)}`;
  statTime.textContent = Number.isFinite(result.totals.time_min)
    ? result.totals.time_min.toFixed(1)
    : 'Not recorded';
  statTimeUnit.textContent = Number.isFinite(result.totals.time_min) ? 'minutes' : '';
  const fareLabel = document.getElementById('statFareLabel');
  const fareNote = document.getElementById('fareNote');
  if (result.fareStatus === 'reported') {
    const report = result.fareEvidence[0];
    fareLabel.textContent = 'User reported fare';
    fareNote.textContent = `User reported on ${report.reported_on}; not independently verified. Effective date is unknown. Applied in both directions by the model. Distance and time were not supplied.`;
  } else if (result.fareStatus === 'mixed') {
    fareLabel.textContent = 'Mixed fare information';
    fareNote.textContent = 'Some segment fares are user reported; remaining segment fares are demonstration estimates.';
  } else {
    fareLabel.textContent = 'Estimated fare';
    const reportedDirect = routeData.routes.find((route) => (
      route.fare_evidence
      && ((route.from === start && route.to === goal) || (route.from === goal && route.to === start))
    ));
    if (reportedDirect) {
      fareNote.textContent = `A direct connection has a user reported US$${reportedDirect.fare_usd.toFixed(2)} fare (${reportedDirect.fare_evidence.reported_on}), not independently verified. Its distance and time are not recorded, so it is not considered in this route objective.`;
    } else {
      fareNote.textContent = 'Demonstration estimate only. No verified fare source is recorded for every segment.';
    }
  }
  highlightPath(result.path);
}

document.getElementById('findBtn').addEventListener('click', findRoute);
loadRoutes();
