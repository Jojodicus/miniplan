from datetime import date

import httpx
import pytest
from sqlalchemy.orm import Session

from app.models.ferienzeitraum import Ferienzeitraum
from app.models.pfarrei import Pfarrei
from app.services import ferien_sync


def test_sync_ferien_speichert_zeitraeume(
    db_session: Session, pfarrei: Pfarrei, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_ferien_fuer_jahr(bundesland, jahr, client):
        if jahr != 2026:
            return []
        return [
            {
                "start": "2026-08-03",
                "end": "2026-09-15",
                "year": 2026,
                "stateCode": bundesland,
                "name": "sommerferien bayern 2026",
                "slug": "sommerferien-bayern-2026",
            }
        ]

    monkeypatch.setattr(ferien_sync, "_ferien_fuer_jahr", fake_ferien_fuer_jahr)

    ergebnis = ferien_sync.sync_ferien(pfarrei, db_session)

    assert len(ergebnis) == 1
    assert ergebnis[0].name == "sommerferien bayern 2026"
    assert ergebnis[0].schuljahr == "2025/2026"

    gespeichert = db_session.query(Ferienzeitraum).filter_by(pfarrei_id=pfarrei.id).all()
    assert len(gespeichert) == 1


def test_sync_ferien_ersetzt_bestehende_eintraege(
    db_session: Session, pfarrei: Pfarrei, monkeypatch: pytest.MonkeyPatch
) -> None:
    alt = Ferienzeitraum(
        pfarrei_id=pfarrei.id,
        name="alte ferien",
        start_datum=date(2020, 1, 1),
        end_datum=date(2020, 1, 10),
        schuljahr="2019/2020",
    )
    db_session.add(alt)
    db_session.commit()

    monkeypatch.setattr(ferien_sync, "_ferien_fuer_jahr", lambda *a, **k: [])

    ergebnis = ferien_sync.sync_ferien(pfarrei, db_session)

    assert ergebnis == []
    assert db_session.query(Ferienzeitraum).filter_by(pfarrei_id=pfarrei.id).count() == 0


def test_ferien_fuer_jahr_wird_fuer_ttl_gecached(monkeypatch: pytest.MonkeyPatch) -> None:
    ferien_sync._cache.clear()
    aufrufe = []

    def handler(request: httpx.Request) -> httpx.Response:
        aufrufe.append(request.url)
        return httpx.Response(200, json=[])

    client = httpx.Client(transport=httpx.MockTransport(handler))

    ferien_sync._ferien_fuer_jahr("BY", 2026, client)
    ferien_sync._ferien_fuer_jahr("BY", 2026, client)
    ferien_sync._ferien_fuer_jahr("NW", 2026, client)

    assert len(aufrufe) == 2
    ferien_sync._cache.clear()


def test_sync_ferien_netzwerkfehler_behaelt_alte_daten(
    db_session: Session, pfarrei: Pfarrei, monkeypatch: pytest.MonkeyPatch
) -> None:
    alt = Ferienzeitraum(
        pfarrei_id=pfarrei.id,
        name="alte ferien",
        start_datum=date(2020, 1, 1),
        end_datum=date(2020, 1, 10),
        schuljahr="2019/2020",
    )
    db_session.add(alt)
    db_session.commit()

    def fake_ferien_fuer_jahr(*args, **kwargs):
        raise httpx.ConnectError("keine Verbindung")

    monkeypatch.setattr(ferien_sync, "_ferien_fuer_jahr", fake_ferien_fuer_jahr)

    with pytest.raises(ferien_sync.FerienSyncFehler):
        ferien_sync.sync_ferien(pfarrei, db_session)

    assert db_session.query(Ferienzeitraum).filter_by(pfarrei_id=pfarrei.id).count() == 1
