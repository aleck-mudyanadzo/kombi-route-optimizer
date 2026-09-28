"""
graph.py
--------
Core graph model for the Kombi Route Optimizer.

Design notes (for the README / dissertation write-up):
- Stops are represented as Nodes in an adjacency-list Graph.
- Each route between two stops is a weighted, undirected Edge with THREE
  independent weights: distance (km), fare (USD), time (minutes). This lets
  a user ask for the "cheapest", "shortest", or "fastest" route using the
  same graph, just switching the weight_key.
- Dijkstra's algorithm is used for exact shortest-path search on any weight.
- A* is provided as an enhancement that uses straight-line (haversine)
  distance as an admissible heuristic when weight_key == "distance_km",
  which should expand fewer nodes than plain Dijkstra on the same graph.

Time complexity:
- Dijkstra (binary heap): O((V + E) log V)
- A* (binary heap, admissible heuristic): worst case same as Dijkstra,
  typically much faster in practice because the heuristic prunes search
  toward the goal.
"""

from __future__ import annotations
import heapq
import json
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


@dataclass
class Node:
    id: str
    name: str
    lat: float
    lon: float


@dataclass
class Edge:
    to: str
    distance_km: Optional[float]
    fare_usd: float
    time_min: Optional[float]
    fare_evidence: Optional[Dict[str, object]] = None

    def weight(self, key: str) -> Optional[float]:
        return getattr(self, key)


class Graph:
    """Undirected weighted graph of kombi stops and routes."""

    VALID_WEIGHTS = ("distance_km", "fare_usd", "time_min")

    def __init__(self) -> None:
        self.nodes: Dict[str, Node] = {}
        self.adjacency: Dict[str, List[Edge]] = {}

    @classmethod
    def from_json(cls, path: str) -> "Graph":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        g = cls()
        for stop in data["stops"]:
            g.add_node(Node(stop["id"], stop["name"], stop["lat"], stop["lon"]))

        for route in data["routes"]:
            g.add_edge(
                route["from"],
                route["to"],
                route["distance_km"],
                route["fare_usd"],
                route["time_min"],
                route.get("fare_evidence"),
            )
        return g

    def add_node(self, node: Node) -> None:
        self.nodes[node.id] = node
        self.adjacency.setdefault(node.id, [])

    def add_edge(
        self,
        a: str,
        b: str,
        distance_km: Optional[float],
        fare_usd: float,
        time_min: Optional[float],
        fare_evidence: Optional[Dict[str, object]] = None,
    ) -> None:
        self.adjacency.setdefault(a, []).append(
            Edge(b, distance_km, fare_usd, time_min, fare_evidence)
        )
        self.adjacency.setdefault(b, []).append(
            Edge(a, distance_km, fare_usd, time_min, fare_evidence)
        )

    def _haversine_km(self, a: str, b: str) -> float:
        """Straight-line distance between two stops, used as the A* heuristic."""
        R = 6371.0
        lat1, lon1 = math.radians(self.nodes[a].lat), math.radians(self.nodes[a].lon)
        lat2, lon2 = math.radians(self.nodes[b].lat), math.radians(self.nodes[b].lon)
        dlat, dlon = lat2 - lat1, lon2 - lon1
        h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        return 2 * R * math.asin(math.sqrt(h))

    def dijkstra(self, start: str, goal: str, weight_key: str = "distance_km") -> Optional[Tuple[List[str], float]]:
        """Return (path, total_weight) for the shortest path, or None if unreachable."""
        if weight_key not in self.VALID_WEIGHTS:
            raise ValueError(f"weight_key must be one of {self.VALID_WEIGHTS}")
        if start not in self.nodes or goal not in self.nodes:
            raise KeyError("start/goal must be valid stop ids")

        dist = {node_id: math.inf for node_id in self.nodes}
        prev: Dict[str, Optional[str]] = {node_id: None for node_id in self.nodes}
        dist[start] = 0.0
        visited = set()
        pq: List[Tuple[float, str]] = [(0.0, start)]

        while pq:
            d, u = heapq.heappop(pq)
            if u in visited:
                continue
            visited.add(u)
            if u == goal:
                break
            for edge in self.adjacency[u]:
                edge_weight = edge.weight(weight_key)
                if edge_weight is None:
                    continue
                nd = d + edge_weight
                if nd < dist[edge.to]:
                    dist[edge.to] = nd
                    prev[edge.to] = u
                    heapq.heappush(pq, (nd, edge.to))

        if dist[goal] == math.inf:
            return None
        return self._reconstruct(prev, start, goal), dist[goal]

    def a_star(self, start: str, goal: str, weight_key: str = "distance_km") -> Optional[Tuple[List[str], float]]:
        """
        A* search. The haversine heuristic is admissible only for
        weight_key == 'distance_km'; use Dijkstra when optimizing by fare or time.
        """
        if weight_key not in self.VALID_WEIGHTS:
            raise ValueError(f"weight_key must be one of {self.VALID_WEIGHTS}")
        if weight_key != "distance_km":
            raise ValueError("A* is only supported for distance_km routing; use Dijkstra for fare/time optimization.")
        if start not in self.nodes or goal not in self.nodes:
            raise KeyError("start/goal must be valid stop ids")

        g_score = {node_id: math.inf for node_id in self.nodes}
        g_score[start] = 0.0
        prev: Dict[str, Optional[str]] = {node_id: None for node_id in self.nodes}
        open_set: List[Tuple[float, str]] = [(self._haversine_km(start, goal), start)]
        visited = set()

        while open_set:
            _, u = heapq.heappop(open_set)
            if u in visited:
                continue
            visited.add(u)
            if u == goal:
                break
            for edge in self.adjacency[u]:
                edge_weight = edge.weight(weight_key)
                if edge_weight is None:
                    continue
                tentative = g_score[u] + edge_weight
                if tentative < g_score[edge.to]:
                    g_score[edge.to] = tentative
                    prev[edge.to] = u
                    f_score = tentative + self._haversine_km(edge.to, goal)
                    heapq.heappush(open_set, (f_score, edge.to))

        if g_score[goal] == math.inf:
            return None
        return self._reconstruct(prev, start, goal), g_score[goal]

    @staticmethod
    def _reconstruct(prev: Dict[str, Optional[str]], start: str, goal: str) -> List[str]:
        path = [goal]
        while path[-1] != start:
            path.append(prev[path[-1]])
        path.reverse()
        return path

    def stop_names(self, path: List[str]) -> List[str]:
        return [self.nodes[s].name for s in path]
