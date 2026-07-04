from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import auth, pfarreien
from app.config import settings

app = FastAPI(title="Miniplan")

app.include_router(auth.router)
app.include_router(pfarreien.router)

static_dir = Path(settings.static_files_dir)
if static_dir.is_dir():
    assets_dir = static_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="static-assets")

    resolved_static_dir = static_dir.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> FileResponse:
        """Liefert vorhandene Static-Dateien direkt aus, ansonsten die SPA-Shell (index.html),
        damit React-Router-Routen wie /login auch bei direktem Aufruf funktionieren."""
        candidate = (static_dir / full_path).resolve()
        is_within_static_dir = candidate.is_relative_to(resolved_static_dir)
        if full_path and is_within_static_dir and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(resolved_static_dir / "index.html")
