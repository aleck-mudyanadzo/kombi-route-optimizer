let allStops = [];
let network = null;
let nodesDataSet, edgesDataSet;

async function loadStops() {
  const res = await fetch('/api/stops');
  allStops = await res.json();

  const fromSel = document.getElementById('from');
  const toSel = document.getElementById('to');
  allStops.forEach(s => {
    fromSel.add(new Option(s.name, s.id));
    toSel.add(new Option(s.name, s.id));
  });
  fromSel.value = 'town';
  toSel.value = 'msu_main';

  renderBaseGraph();
}

function renderBaseGraph() {
  const nodes = allStops.map(s => ({
    id: s.id,
    label: s.name,
    shape: 'dot',
    size: 12,
    color: '#334155',
    font: { color: '#e2e8f0', size: 12 },
  }));

  nodesDataSet = new vis.DataSet(nodes);
  edgesDataSet = new vis.DataSet();

  const container = document.getElementById('network');
  network = new vis.Network(container, { nodes: nodesDataSet, edges: edgesDataSet }, {
    physics: { stabilization: true, barnesHut: { gravitationalConstant: -4000 } },
    interaction: { hover: true },
  });
}

function highlightPath(path) {
  // reset all nodes
  nodesDataSet.forEach(n => {
    nodesDataSet.update({ id: n.id, color: '#334155', size: 12 });
  });
  edgesDataSet.clear();

  path.forEach((id, i) => {
    nodesDataSet.update({ id, color: '#22c55e', size: 18 });
    if (i < path.length - 1) {
      edgesDataSet.add({
        from: id,
        to: path[i + 1],
        color: { color: '#22c55e' },
        width: 3,
        arrows: '',
      });
    }
  });
}

async function findRoute() {
  const from = document.getElementById('from').value;
  const to = document.getElementById('to').value;
  const mode = document.getElementById('mode').value;
  const algo = document.getElementById('algo').value;

  if (from === to) {
    alert('Pick two different stops.');
    return;
  }

  const url = `/api/route?from=${from}&to=${to}&mode=${mode}&algo=${algo}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    alert(data.error);
    return;
  }

  document.getElementById('result').classList.remove('hidden');
  document.getElementById('routePath').textContent = data.stop_names.join(' → ');
  document.getElementById('statDistance').textContent = data.total_distance_km;
  document.getElementById('statFare').textContent = `$${data.total_fare_usd}`;
  document.getElementById('statTime').textContent = data.total_time_min;

  highlightPath(data.path);
}

document.getElementById('findBtn').addEventListener('click', findRoute);
loadStops();
