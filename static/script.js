let routeData;
let nodesDataSet;
let edgesDataSet;

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

    renderBaseGraph();
    document.getElementById('findBtn').disabled = false;
    message.textContent = 'Choose two stops to find a route.';
  } catch (error) {
    message.textContent = `Unable to start the route finder: ${error.message}`;
  }
}

function renderBaseGraph() {
  nodesDataSet = new vis.DataSet(routeData.stops.map((stop) => ({
    id: stop.id,
    label: stop.name,
    shape: 'dot',
    size: 12,
    color: '#8a795e',
    font: { color: '#382a28', size: 13 },
  })));
  edgesDataSet = new vis.DataSet();

  const container = document.getElementById('network');
  new vis.Network(container, { nodes: nodesDataSet, edges: edgesDataSet }, {
    physics: { stabilization: true, barnesHut: { gravitationalConstant: -4000 } },
    interaction: { hover: true },
  });
}

function highlightPath(path) {
  nodesDataSet.forEach((node) => {
    nodesDataSet.update({ id: node.id, color: '#8a795e', size: 12 });
  });
  edgesDataSet.clear();

  path.forEach((id, index) => {
    nodesDataSet.update({ id, color: '#70283f', size: 18 });
    if (index < path.length - 1) {
      edgesDataSet.add({
        from: id,
        to: path[index + 1],
        color: { color: '#a65e3c' },
        width: 3,
      });
    }
  });
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
  document.getElementById('statDistance').textContent = result.totals.distance_km.toFixed(2);
  document.getElementById('statFare').textContent = `$${result.totals.fare_usd.toFixed(2)}`;
  document.getElementById('statTime').textContent = result.totals.time_min.toFixed(1);
  highlightPath(result.path);
}

document.getElementById('findBtn').addEventListener('click', findRoute);
loadRoutes();
