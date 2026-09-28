"""Build a GitHub Pages artifact with canonical repository URLs."""

import argparse
import re
import shutil
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring


ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def build_pages(repository: str, output_dir: Path) -> str:
    if not REPOSITORY_PATTERN.fullmatch(repository):
        raise ValueError("repository must be an owner/repository GitHub slug")

    owner, repo = repository.split("/", 1)
    if owner in {".", ".."} or repo in {".", ".."}:
        raise ValueError("repository must be an owner/repository GitHub slug")
    canonical_url = f"https://{owner.lower()}.github.io/{repo}/"
    output_dir.mkdir(parents=True, exist_ok=True)

    shutil.copytree(ROOT / "static", output_dir, dirs_exist_ok=True)
    shutil.copytree(ROOT / "data", output_dir / "data", dirs_exist_ok=True)
    index_file = output_dir / "index.html"
    index_html = index_file.read_text(encoding="utf-8")
    if "__CANONICAL_URL__" not in index_html:
        raise ValueError("index.html is missing the canonical URL placeholder")
    index_file.write_text(index_html.replace("__CANONICAL_URL__", canonical_url), encoding="utf-8")

    urlset = Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    url = SubElement(urlset, "url")
    SubElement(url, "loc").text = canonical_url
    (output_dir / "sitemap.xml").write_bytes(
        tostring(urlset, encoding="utf-8", xml_declaration=True)
    )

    robots = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        f"Sitemap: {canonical_url}sitemap.xml\n"
    )
    (output_dir / "robots.txt").write_text(robots, encoding="utf-8")
    return canonical_url


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True, help="GitHub owner/repository slug")
    parser.add_argument("--output", type=Path, required=True, help="Directory for the Pages artifact")
    args = parser.parse_args()
    build_pages(args.repository, args.output)


if __name__ == "__main__":
    main()
