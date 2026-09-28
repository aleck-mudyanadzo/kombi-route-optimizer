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
    app.run(debug=True, port=5000)
