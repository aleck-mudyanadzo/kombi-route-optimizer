"""
app.py
------
Flask API for the Kombi Route Optimizer.

Endpoints:
  GET /api/stops
      -> list of all stops (id, name, lat, lon)

  GET /api/route?from=<id>&to=<id>&mode=cheapest|fastest|shortest&algo=dijkstra|astar
      -> {path: [...], stop_names: [...], total_distance_km, total_fare_usd, total_time_min, algo}
"""

from flask import Flask, jsonify, request, send_from_directory
from graph import Graph
import os
from urllib.parse import urlsplit
from xml.etree.ElementTree import Element, SubElement, tostring

app = Flask(__name__, static_folder="static", static_url_path="")

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "gweru_routes.json")
graph = Graph.from_json(DATA_PATH)

MODE_TO_WEIGHT = {
    "cheapest": "fare_usd",
    "fastest": "time_min",
    "shortest": "distance_km",
}
ALLOWED_ALGOS = {"dijkstra", "astar"}


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/stops")
def stops():
    return jsonify([
        {"id": n.id, "name": n.name, "lat": n.lat, "lon": n.lon}
        for n in graph.nodes.values()
    ])


@app.route("/data/gweru_routes.json")
def route_data():
    return send_from_directory(os.path.join(os.path.dirname(__file__), "data"), "gweru_routes.json")


def public_base_url():
    value = os.environ.get("PUBLIC_BASE_URL", "").strip()
    if not value:
        return None

    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("PUBLIC_BASE_URL must be an absolute HTTP(S) origin, e.g. https://example.com")

    return f"{parsed.scheme}://{parsed.netloc}"


@app.route("/robots.txt")
def robots():
    lines = ["User-agent: *", "Allow: /", "Disallow: /api/"]
    try:
        base_url = public_base_url()
    except ValueError as error:
        return jsonify({"error": str(error)}), 500
    if base_url:
        lines.append(f"Sitemap: {base_url}/sitemap.xml")
    return app.response_class("\n".join(lines) + "\n", mimetype="text/plain")


@app.route("/sitemap.xml")
def sitemap():
    try:
        base_url = public_base_url()
    except ValueError as error:
        return jsonify({"error": str(error)}), 500
    if not base_url:
        return jsonify({"error": "Set PUBLIC_BASE_URL to the public site origin to enable the sitemap"}), 503

    urlset = Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    url = SubElement(urlset, "url")
    SubElement(url, "loc").text = f"{base_url}/"
    body = tostring(urlset, encoding="utf-8", xml_declaration=True)
    return app.response_class(body, mimetype="application/xml")


@app.route("/api/route")
def route():
    start = request.args.get("from")
    goal = request.args.get("to")
    mode = request.args.get("mode", "shortest")
    algo = request.args.get("algo", "dijkstra")

    if not start or not goal:
        return jsonify({"error": "Both 'from' and 'to' query params are required"}), 400
    if mode not in MODE_TO_WEIGHT:
        return jsonify({"error": f"mode must be one of {list(MODE_TO_WEIGHT)}"}), 400
    if algo not in ALLOWED_ALGOS:
        return jsonify({"error": f"algo must be one of {sorted(ALLOWED_ALGOS)}"}), 400
    if start not in graph.nodes or goal not in graph.nodes:
        return jsonify({"error": "Unknown stop id"}), 404

    weight_key = MODE_TO_WEIGHT[mode]
    if algo == "astar" and weight_key != "distance_km":
        return jsonify({"error": "A* is only supported for shortest-distance routing because its heuristic is only admissible for distance-based optimization"}), 400

    try:
        if algo == "astar":
            result = graph.a_star(start, goal, weight_key)
        else:
            result = graph.dijkstra(start, goal, weight_key)
    except (KeyError, ValueError) as e:
        return jsonify({"error": str(e)}), 400

    if result is None:
        return jsonify({"error": "No route found between these stops"}), 404

    path, _total = result

    # Compute all three totals along the chosen path for a fuller comparison view
    totals = {"distance_km": 0.0, "fare_usd": 0.0, "time_min": 0.0}
    for a, b in zip(path, path[1:]):
        for edge in graph.adjacency[a]:
            if edge.to == b:
                totals["distance_km"] += edge.distance_km
                totals["fare_usd"] += edge.fare_usd
                totals["time_min"] += edge.time_min
                break

    return jsonify({
        "path": path,
        "stop_names": graph.stop_names(path),
        "total_distance_km": round(totals["distance_km"], 2),
        "total_fare_usd": round(totals["fare_usd"], 2),
        "total_time_min": round(totals["time_min"], 1),
        "mode": mode,
        "algo": algo,
    })


if __name__ == "__main__":
    app.run(port=5000)
