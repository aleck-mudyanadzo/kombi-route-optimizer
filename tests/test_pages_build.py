import sys
from pathlib import Path
from xml.etree import ElementTree

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.build_pages import build_pages


def test_builds_repo_relative_pages_with_canonical_crawler_files(tmp_path):
    site_dir = tmp_path / "site"
    canonical_url = build_pages("aleckalkahmudyanadzo-cyber/kombi-route-optimizer", site_dir)

    assert canonical_url == "https://aleckalkahmudyanadzo-cyber.github.io/kombi-route-optimizer/"
    index_html = (site_dir / "index.html").read_text(encoding="utf-8")
    assert f'<link rel="canonical" href="{canonical_url}"' in index_html
    assert 'href="./style.css"' in index_html
    assert 'src="./router.js"' in index_html
    assert "__CANONICAL_URL__" not in index_html
    assert (site_dir / "data" / "gweru_routes.json").is_file()
    assert "Disallow: /api/" in (site_dir / "robots.txt").read_text(encoding="utf-8")

    sitemap = ElementTree.parse(site_dir / "sitemap.xml")
    namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    assert sitemap.findtext("s:url/s:loc", namespaces=namespace) == canonical_url


@pytest.mark.parametrize("repository", ["owner", "owner/repo/extra", "https://owner/repo", "../repo"])
def test_rejects_invalid_repository_slug(repository, tmp_path):
    with pytest.raises(ValueError, match="owner/repository"):
        build_pages(repository, tmp_path / "site")
