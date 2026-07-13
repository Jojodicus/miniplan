from fastapi import APIRouter

router = APIRouter(prefix="/api/_e2e-stubs", tags=["e2e-stubs"], include_in_schema=False)


@router.get("/ferien-api/holidays/{bundesland}/{jahr}")
def ferien_stub(bundesland: str, jahr: int) -> list[dict]:
    """Nur registriert, wenn MINIPLAN_ENABLE_TEST_STUBS gesetzt ist (siehe main.py) - liefert
    statische Ferien-Daten im Format von ferien-api.de. docker-compose.e2e.yml zeigt
    MINIPLAN_FERIEN_API_URL hierher, damit die Playwright-Suite nicht von der echten, mit anderen
    Nutzern geteilten externen Quelle abhängt (Rate-Limit, Netzwerk-Flakiness)."""
    return [
        {
            "start": f"{jahr}-08-01",
            "end": f"{jahr}-08-14",
            "year": jahr,
            "stateCode": bundesland,
            "name": f"sommerferien {bundesland.lower()} {jahr}",
            "slug": f"sommerferien-{bundesland.lower()}-{jahr}",
        }
    ]
