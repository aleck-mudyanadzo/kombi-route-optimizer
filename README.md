# 🚐 Kombi Route Optimizer

A shortest-path finder for Gweru's kombi (minibus taxi) network, built to explore
and compare **Dijkstra's algorithm** and **A\* search** on a real-world-inspired
transport graph. Given two stops, it finds the cheapest, fastest, or shortest
route and displays its stops and illustrative model connections on a mapped
street and building basemap.

Built as part of my Design & Analysis of Algorithms coursework at Midlands
State University, Computer Science.

## Why this project

Kombis are the backbone of urban transport in Zimbabwe, but there's no tool
for comparing routes by cost, time, or distance the way ride-hailing apps do
elsewhere. This project models that problem as a weighted graph and applies
classic pathfinding algorithms to solve it a small but complete example of
taking algorithms from the classroom into a locally relevant application.

## Features

- **Three optimization modes**: cheapest fare, fastest time, shortest distance
- **Two algorithms**: Dijkstra (guaranteed optimal on any weight) and A*
  (heuristic-guided search using real coordinates, faster in practice)
- **Mapped 2D and 3D view** of Gweru streets and building footprints using
  MapLibre GL JS and the OpenFreeMap Positron vector style
- **Illustrative model connections** between stop coordinates, clearly
  distinguished from mapped streets and official kombi lines
- **Fare provenance labels** that separate the one user reported CBD to MSU
  fare from demonstration estimates
- **Static client-side route finder** that works on GitHub Pages without a Flask server
- **REST API** so the routing logic is decoupled from the frontend
- **Unit tested** core algorithms

## Tech stack

- Python 3 (OOP graph model, `graph.py`)
- Flask (REST API, `app.py`)
- Gunicorn (production WSGI server for deployment)
- Vanilla JS + [MapLibre GL JS](https://maplibre.org/) (client-side routing and mapping)
- [OpenFreeMap](https://openfreemap.org/) vector tiles based on
  [OpenStreetMap](https://www.openstreetmap.org/copyright) data
- pytest (tests)

## Project structure

```
kombi-route-optimizer/
├── app.py                 # Flask API
├── graph.py                # Graph, Node, Edge classes + Dijkstra + A*
├── data/
│   └── gweru_routes.json   # Stops and routes dataset
├── scripts/
│   └── build_pages.py      # Builds static site and canonical crawler files
├── static/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   ├── router.js
│   └── map-data.js
├── render.yaml             # Render web service configuration
├── tests/
│   ├── test_graph.py
│   └── test_pages_build.py
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
node --test static/router.test.js
```

## Deploying the static demo with GitHub Pages

The browser application reads `data/gweru_routes.json` directly and runs
Dijkstra or A* locally; it does not call the Flask API. The Flask API remains
available for server deployments and its behavior is unchanged. The
`.github/workflows/deploy-pages.yml` workflow tests the project and builds the
static artifact when changes reach `main`. It derives the canonical GitHub
Pages URL from the repository name and generates `sitemap.xml` and
`robots.txt`; all local asset and data URLs are relative so the site works at
the repository subpath.

To publish, merge the reviewed changes into `main`, then enable **GitHub Pages**
for the repository using **GitHub Actions** as the build and deployment source.
The workflow will publish the site. For this repository its expected URL is
`https://aleck-mudyanadzo.github.io/kombi-route-optimizer/`. A custom
domain would require updating the canonical URL generation before using it.
The site loads MapLibre GL JS from a CDN and map styles and vector tiles from
OpenFreeMap. The visible attribution links to OpenStreetMap contributors and
OpenFreeMap. If the external map service is unavailable, route calculations
remain available and the map displays an accessible warning.

Search engines may take time to discover and index the site; this workflow
does not guarantee indexing. The basemap shows mapped streets and buildings;
the app's stop coordinates are approximate and its dashed connection lines
are illustrative graph links, not official kombi lines, road directions, or
turn by turn paths.

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
**three independent weights** distance (km), fare (USD), and time (min) 
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

This distinction  where a heuristic works and where it stops being
admissible was the most interesting part of building this, and it's the
kind of nuance that's easy to miss if you just copy a textbook A*
implementation without thinking about what the heuristic actually represents.

## Data and fare provenance

The vector basemap provides mapped OpenStreetMap streets and building
footprints through OpenFreeMap. It is separate from the approximate stop
coordinates and dashed straight line model connections in
`data/gweru_routes.json`; those lines are not mapped kombi routes or road
directions. Distance and travel time weights remain demonstration estimates.
The MSU Main Campus to Gweru CBD model edge uses a US$0.50 fare from a user report
dated 2026-09-28. It is not independently verified and has no confirmed
effective date. The graph is undirected and applies that reported fare in both
directions, as recorded in the edge's `fare_evidence.directional_scope`;
this is a model assumption, not independent confirmation for the reverse
direction. The report contains no distance or time measurement for this
connection, so both weights are `null`; distance and time searches skip that
edge, and a fare-selected itinerary shows those totals as not recorded. When
the endpoints are CBD and MSU, other route objectives can still surface the
reported direct fare as context while explaining that its missing distance
and time exclude it from those comparisons.

The Herald reported a general Gweru private kombi range of US$0.75 to US$1
per trip on 2026-03-24, including a Mkoba 20 commuter's account of a fare
increase. The report does not provide a route by route schedule or clear fare
effective date. It is recorded as `fare_market_reference` context only and
does not set any graph weight. All other `fare_usd` values remain
demonstration estimates.

When updating a route fare, keep its numeric `fare_usd` weight and attach
route-level `fare_evidence` with the source, source URL or interview context,
report or observation date, currency, effective date (or `null` if unknown),
verification status, and directional scope. Do not apply a published general
range to individual edges without route-specific evidence. Use dated
on-street origin and destination fare surveys or a published operator or
authority schedule to verify missing fares.

## Possible extensions

- Time-of-day traffic weighting
- Multi-hop fare aggregation matching real kombi fare-per-leg pricing
- GPS-based real-time stop suggestions
- Expand to Harare/Bulawayo route networks

## Author

Aleck Mudyanadzo  BSc Computer Science, Midlands State University
