import os
import sys
import math

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

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
