import os
import sys
import math

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import app as flask_app
from graph import Graph, Node

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "gweru_routes.json")


def make_simple_graph():
    """A tiny 4-node graph with a known shortest path, independent of the real data file."""
    g = Graph()
    g.add_node(Node("A", "A", 0.0, 0.0))
    g.add_node(Node("B", "B", 0.0, 1.0))
    g.add_node(Node("C", "C", 1.0, 0.0))
    g.add_node(Node("D", "D", 1.0, 1.0))
    g.add_edge("A", "B", distance_km=1, fare_usd=1, time_min=5)
    g.add_edge("B", "D", distance_km=1, fare_usd=1, time_min=5)
    g.add_edge("A", "C", distance_km=5, fare_usd=1, time_min=20)
    g.add_edge("C", "D", distance_km=1, fare_usd=1, time_min=5)
    return g


def test_dijkstra_finds_shortest_path():
    g = make_simple_graph()
    path, total = g.dijkstra("A", "D", "distance_km")
    assert path == ["A", "B", "D"]
    assert total == 2


def test_dijkstra_respects_different_weight_keys():
    g = make_simple_graph()
    # Even though A-C-D is longer in distance, make fare cheaper on that path
    g.adjacency["A"][1].fare_usd = 0.1  # A->C
    g.adjacency["C"][0].fare_usd = 0.1  # C->A (undirected mirror)
    g.adjacency["C"][1].fare_usd = 0.1  # C->D
    g.adjacency["D"][1].fare_usd = 0.1  # D->C mirror
    path, total = g.dijkstra("A", "D", "fare_usd")
    assert path == ["A", "C", "D"]


def test_a_star_matches_dijkstra_on_distance():
    g = Graph.from_json(DATA_PATH)
    for a in ("town", "kudzanai", "mtapa"):
        for b in ("msu_main", "guinea_fowl", "northlea"):
            d_path, d_total = g.dijkstra(a, b, "distance_km")
            a_path, a_total = g.a_star(a, b, "distance_km")
            assert math.isclose(d_total, a_total, rel_tol=1e-6), f"{a}->{b} totals differ"


def test_unreachable_returns_none():
    g = Graph()
    g.add_node(Node("X", "X", 0, 0))
    g.add_node(Node("Y", "Y", 1, 1))
    assert g.dijkstra("X", "Y", "distance_km") is None


def test_real_data_loads_and_routes():
    g = Graph.from_json(DATA_PATH)
    assert "msu_main" in g.nodes
    path, total = g.dijkstra("town", "msu_main", "time_min")
    assert path[0] == "town"
    assert path[-1] == "msu_main"
    assert total > 0


def test_astar_is_rejected_for_non_distance_modes():
    g = Graph.from_json(DATA_PATH)
    assert g.a_star("town", "msu_main", "distance_km") is not None
    try:
        g.a_star("town", "msu_main", "time_min")
        assert False, "A* should reject non-distance optimization"
    except ValueError:
        pass


def test_api_rejects_astar_for_non_distance_mode():
    client = flask_app.test_client()
    resp = client.get("/api/route?from=town&to=msu_main&mode=fastest&algo=astar")
    assert resp.status_code == 400
    assert "A* is only supported" in resp.get_json()["error"]


def test_route_dataset_is_served_for_local_client():
    response = flask_app.test_client().get("/data/gweru_routes.json")

    assert response.status_code == 200
    assert response.get_json()["stops"][0]["id"] == "kudzanai"


def test_api_rejects_unknown_algorithm():
    client = flask_app.test_client()
    resp = client.get("/api/route?from=town&to=msu_main&algo=unknown")

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "algo must be one of ['astar', 'dijkstra']"}


@pytest.mark.parametrize(
    ("algo", "mode"),
    [("dijkstra", "fastest"), ("astar", "shortest")],
)
def test_api_accepts_supported_algorithms(algo, mode):
    client = flask_app.test_client()
    resp = client.get(
        f"/api/route?from=town&to=msu_main&algo={algo}&mode={mode}"
    )

    assert resp.status_code == 200
    assert resp.get_json()["algo"] == algo


def test_robots_allows_crawling_and_omits_sitemap_without_public_url(monkeypatch):
    monkeypatch.delenv("PUBLIC_BASE_URL", raising=False)
    response = flask_app.test_client().get("/robots.txt")

    assert response.status_code == 200
    assert response.mimetype == "text/plain"
    assert response.get_data(as_text=True) == "User-agent: *\nAllow: /\nDisallow: /api/\n"


def test_sitemap_requires_public_base_url(monkeypatch):
    monkeypatch.delenv("PUBLIC_BASE_URL", raising=False)
    response = flask_app.test_client().get("/sitemap.xml")

    assert response.status_code == 503
    assert "PUBLIC_BASE_URL" in response.get_json()["error"]


def test_robots_and_sitemap_use_configured_public_url(monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://kombi.example/")
    client = flask_app.test_client()

    robots_response = client.get("/robots.txt")
    sitemap_response = client.get("/sitemap.xml")

    assert "Sitemap: https://kombi.example/sitemap.xml" in robots_response.get_data(as_text=True)
    assert sitemap_response.status_code == 200
    assert sitemap_response.mimetype == "application/xml"
    assert b"<loc>https://kombi.example/</loc>" in sitemap_response.data


def test_sitemap_rejects_invalid_public_url(monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.com/path")

    response = flask_app.test_client().get("/sitemap.xml")

    assert response.status_code == 500
    assert "PUBLIC_BASE_URL must be an absolute HTTP(S) origin" in response.get_json()["error"]


def test_home_page_includes_search_and_social_metadata():
    response = flask_app.test_client().get("/")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert '<title>Kombi Route Optimizer | Gweru</title>' in html
    assert 'name="description"' in html
    assert 'property="og:title"' in html
    assert 'name="twitter:card"' in html
