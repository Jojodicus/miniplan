from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient


def _build_spa_app(static_dir: Path) -> FastAPI:
    """Baut minimal die SPA-Fallback-Logik aus app.main nach, mit einem Test-Static-Verzeichnis."""
    app = FastAPI()
    resolved_static_dir = static_dir.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> FileResponse:
        candidate = (static_dir / full_path).resolve()
        is_within_static_dir = candidate.is_relative_to(resolved_static_dir)
        if full_path and is_within_static_dir and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(resolved_static_dir / "index.html")

    return app


@pytest.fixture
def spa_client(tmp_path: Path) -> Generator[TestClient, None, None]:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<html>spa-shell</html>")

    geheimnis = tmp_path / "secret_key"
    geheimnis.write_text("top-secret")

    app = _build_spa_app(static_dir)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


def test_bekannte_route_liefert_spa_shell(spa_client: TestClient) -> None:
    response = spa_client.get("/login")
    assert response.status_code == 200
    assert "spa-shell" in response.text


def test_pfad_traversal_ausserhalb_des_static_verzeichnisses_wird_blockiert(
    spa_client: TestClient,
) -> None:
    response = spa_client.get("/..%2fsecret_key")
    assert response.status_code == 200
    assert "top-secret" not in response.text
    assert "spa-shell" in response.text
