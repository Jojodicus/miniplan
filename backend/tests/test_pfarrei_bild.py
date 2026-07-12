import struct
import zlib

import pytest
from fastapi.testclient import TestClient

from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from app.services import pfarrei_bild
from tests.conftest import auth_headers


def _png_bytes() -> bytes:
    """Minimales gültiges 1x1-PNG (Inhalt ist für die Tests egal, nur der Content-Type zählt)."""
    def chunk(typ: bytes, daten: bytes) -> bytes:
        return struct.pack(">I", len(daten)) + typ + daten + struct.pack(
            ">I", zlib.crc32(typ + daten) & 0xFFFFFFFF
        )

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    idat = zlib.compress(b"\x00\x00\x00\x00\x00")
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(autouse=True)
def _temp_media_dir(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(pfarrei_bild.settings, "media_dir", str(tmp_path))


def test_bild_upload_abruf_und_loeschen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")

    # Ohne Bild: 404, und hat_bild ist False.
    assert client.get(f"/api/pfarreien/{pfarrei.id}/bild", headers=headers).status_code == 404
    detail = client.get(f"/api/pfarreien/{pfarrei.id}", headers=headers).json()
    assert detail["hat_bild"] is False

    # Hochladen.
    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/bild",
        files={"datei": ("kirche.png", _png_bytes(), "image/png")},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["hat_bild"] is True

    # Abrufen liefert das Bild.
    response = client.get(f"/api/pfarreien/{pfarrei.id}/bild", headers=headers)
    assert response.status_code == 200
    assert response.content[:8] == b"\x89PNG\r\n\x1a\n"

    # Entfernen.
    response = client.delete(f"/api/pfarreien/{pfarrei.id}/bild", headers=headers)
    assert response.status_code == 200
    assert response.json()["hat_bild"] is False
    assert client.get(f"/api/pfarreien/{pfarrei.id}/bild", headers=headers).status_code == 404


def test_bild_upload_lehnt_falschen_typ_ab(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/bild",
        files={"datei": ("schaedlich.txt", b"kein bild", "text/plain")},
        headers=headers,
    )
    assert response.status_code == 415


def test_bild_upload_erfordert_verantwortlich(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/bild",
        files={"datei": ("kirche.png", _png_bytes(), "image/png")},
        headers=headers,
    )
    assert response.status_code == 403


def test_bild_abruf_fremder_pfarrei_verweigert(
    client: TestClient, verantwortlicher_user: Nutzer, db_session
) -> None:
    andere = Pfarrei(name="Fremde Pfarrei", bild_dateiname="pfarrei-999.png")
    db_session.add(andere)
    db_session.commit()
    db_session.refresh(andere)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    # Nutzer ohne Rolle in dieser Pfarrei bekommt 403 (kein anonymer/fremder Bildzugriff).
    assert client.get(f"/api/pfarreien/{andere.id}/bild", headers=headers).status_code == 403


def test_bild_abruf_unauthentifiziert_verweigert(
    client: TestClient, pfarrei: Pfarrei
) -> None:
    assert client.get(f"/api/pfarreien/{pfarrei.id}/bild").status_code == 401
