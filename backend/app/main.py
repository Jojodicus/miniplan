from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from app.api import (
    auth,
    dienst_typen,
    feiertage,
    filtertag_blocker,
    gottesdienste,
    gruppen,
    minis,
    miniplaene,
    pfarreien,
)
from app.config import settings

app = FastAPI(title="Miniplan")


@app.middleware("http")
async def security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-src 'self' blob:"
    if settings.cookie_secure:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


app.include_router(auth.router)
app.include_router(pfarreien.router)
app.include_router(gruppen.router)
app.include_router(minis.router)
app.include_router(dienst_typen.router)
app.include_router(filtertag_blocker.router)
app.include_router(feiertage.router)
app.include_router(miniplaene.router)
app.include_router(gottesdienste.router)


@app.get("/api/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}

static_dir = Path(settings.static_files_dir)
if static_dir.is_dir():
    assets_dir = static_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="static-assets")

    resolved_static_dir = static_dir.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> FileResponse:
        """Liefert vorhandene Static-Dateien direkt aus, ansonsten die SPA-Shell (index.html),
        damit React-Router-Routen wie /login auch bei direktem Aufruf funktionieren. Unbekannte
        /api/-Pfade geben 404 statt der SPA-Shell zurück, damit sie nicht als vermeintlich
        erfolgreiche HTML-Antwort erscheinen."""
        if full_path.startswith("api/"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        candidate = (static_dir / full_path).resolve()
        is_within_static_dir = candidate.is_relative_to(resolved_static_dir)
        if full_path and is_within_static_dir and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(resolved_static_dir / "index.html")
