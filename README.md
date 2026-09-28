# 🚐 Kombi Route Optimizer

A shortest-path finder for Gweru's kombi (minibus taxi) network, built to explore
and compare **Dijkstra's algorithm** and **A\* search** on a real-world-inspired
transport graph. Given two stops, it finds the cheapest, fastest, or shortest
route and visualizes it on an interactive graph.

Built as part of my Design & Analysis of Algorithms coursework at Midlands
State University, Computer Science.

## Why this project

Kombis are the backbone of urban transport in Zimbabwe, but there's no tool
for comparing routes by cost, time, or distance the way ride-hailing apps do
elsewhere. This project models that problem as a weighted graph and applies
classic pathfinding algorithms to solve it — a small but complete example of
taking algorithms from the classroom into a locally relevant application.

## Features

- **Three optimization modes**: cheapest fare, fastest time, shortest distance
- **Two algorithms**: Dijkstra (guaranteed optimal on any weight) and A*
  (heuristic-guided search using real coordinates, faster in practice)
- **Interactive graph visualization** of all stops and the highlighted route
- **REST API** so the routing logic is decoupled from the frontend
- **Unit tested** core algorithms

## Tech stack

- Python 3 (OOP graph model, `graph.py`)
- Flask (REST API, `app.py`)
- Gunicorn (production WSGI server for deployment)
- Vanilla JS + [vis-network](https://visjs.github.io/vis-network/) (frontend)
- pytest (tests)

## Project structure

```
kombi-route-optimizer/
├── app.py                 # Flask API
├── graph.py                # Graph, Node, Edge classes + Dijkstra + A*
├── data/
│   └── gweru_routes.json   # Stops and routes dataset
├── static/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── render.yaml             # Render web service configuration
├── tests/
│   └── test_graph.py
└── requirements.txt
```

## Running it locally

```bash
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 app.py
```

Then open `http://localhost:5000` in your browser.

Run the tests:

```bash
python -m pytest tests/ -v
```

## Deploying to Render

The repository includes a Render Blueprint in `render.yaml`. Push the project
to a GitHub repository under your account, create a new Blueprint in Render,
and connect that repository. Render installs `requirements.txt` and starts the
production server with Gunicorn (`gunicorn app:app`); the Flask development
server is only used by `python app.py` for local work.

After Render assigns the service a public URL, set `PUBLIC_BASE_URL` in the
service's environment settings to that origin, for example
`https://your-service.onrender.com` (no path or trailing route). Do not include
credentials, a query string, or a fragment. Add this setting after the first
deployment, when Render has assigned the public URL, then redeploy. The app
uses this value to publish `/sitemap.xml` and include its absolute URL in
`/robots.txt`; without it, public pages remain crawlable while API routes are
excluded and the sitemap endpoint returns 503. If you later use a custom
domain, update `PUBLIC_BASE_URL` to the canonical HTTPS origin and redeploy.

The HTML page includes a descriptive title, search description, and Open Graph
and Twitter summary metadata. Once the public URL is live, submit
`https://your-service.onrender.com/sitemap.xml` (using your actual service URL)
to Google Search Console or another search engine's webmaster tools if
desired. Discovery and indexing are controlled by those services and are not
guaranteed. The route distances, fares, and travel times are illustrative
estimates, not verified live transit information.

## Algorithm design & complexity analysis

Each stop is a `Node`; each kombi route is a bidirectional `Edge` carrying
**three independent weights** — distance (km), fare (USD), and time (min) —
so the same graph answers "cheapest", "fastest", and "shortest" queries just
by switching which weight the search uses.

**Dijkstra's algorithm** (binary heap implementation):
- Time complexity: `O((V + E) log V)`
- Guaranteed to find the optimal path for any of the three weight types
- Used as the baseline / correctness reference

**A\* search**:
- Time complexity: same worst case as Dijkstra, `O((V + E) log V)`, but
  explores far fewer nodes in practice
- Uses **haversine (straight-line) distance** between real stop coordinates
  as the heuristic
- This heuristic is only *admissible* (guarantees optimality) when optimizing
  for `distance_km`, since it's derived from actual geography — this is
  called out explicitly in `graph.py` rather than glossed over, since using
  a distance-based heuristic to optimize for fare or time isn't theoretically
  guaranteed to be optimal, even though it still returns a good result in
  this dataset

This distinction — where a heuristic works and where it stops being
admissible — was the most interesting part of building this, and it's the
kind of nuance that's easy to miss if you just copy a textbook A*
implementation without thinking about what the heuristic actually represents.

## Data note

Stop names and connectivity reflect real Gweru suburbs and kombi ranks.
Exact distances, fares, and travel times are **estimates** for demonstration
— before treating this as production-accurate, replace `data/gweru_routes.json`
with surveyed figures.

## Possible extensions

- Time-of-day traffic weighting
- Multi-hop fare aggregation matching real kombi fare-per-leg pricing
- GPS-based real-time stop suggestions
- Expand to Harare/Bulawayo route networks

## Author

Aleck Mudyanadzo — BSc Computer Science, Midlands State University
