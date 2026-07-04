from datetime import date, time

import pytest

from app.schemas.miniplan_vorschau import (
    MiniplanVorschauIn,
    VorschauDienstbedarf,
    VorschauGottesdienst,
    VorschauGruppenAnforderung,
)
from app.services.typst_render import TypstCompileError, render_miniplan_pdf


def _plan(**overrides) -> MiniplanVorschauIn:
    daten = dict(monat=7, jahr=2026, veranstaltungen=None, ankuendigungen=None, gottesdienste=[])
    daten.update(overrides)
    return MiniplanVorschauIn(**daten)


def test_render_leerer_plan_liefert_pdf() -> None:
    pdf = render_miniplan_pdf("St. Beispiel", _plan())
    assert pdf.startswith(b"%PDF")


def test_render_mit_gottesdienst_und_dienstbedarf_liefert_pdf() -> None:
    plan = _plan(
        veranstaltungen="Pfarrfest am 20.07.",
        ankuendigungen="Bitte pünktlich erscheinen",
        gottesdienste=[
            VorschauGottesdienst(
                datum=date(2026, 7, 5),
                uhrzeit=time(10, 0),
                name="Sonntagsmesse",
                dienstbedarf=[
                    VorschauDienstbedarf(
                        name="Weihrauch",
                        anzahl=2,
                        gruppen_anforderungen=[
                            VorschauGruppenAnforderung(gruppe_name="Obermini", mindest_anzahl=1)
                        ],
                        zugewiesene_minis=["Max Mustermann"],
                    )
                ],
            )
        ],
    )
    pdf = render_miniplan_pdf("St. Beispiel", plan)
    assert pdf.startswith(b"%PDF")


def test_render_mit_sonderzeichen_wird_sicher_escaped() -> None:
    plan = _plan(
        gottesdienste=[
            VorschauGottesdienst(
                datum=date(2026, 7, 5),
                uhrzeit=time(10, 0),
                name='Sonderzeichen "Test" \\ #include("etc/passwd")',
                dienstbedarf=[
                    VorschauDienstbedarf(name='Dienst "#eval" mit \\ Backslash', anzahl=1)
                ],
            )
        ],
        veranstaltungen="Zeile 1\nZeile 2",
    )
    pdf = render_miniplan_pdf("St. Beispiel", plan)
    assert pdf.startswith(b"%PDF")


def test_render_fehlerhaftes_template_wirft_strukturierten_fehler(monkeypatch) -> None:
    import app.services.typst_render as render_module

    monkeypatch.setattr(render_module, "_build_source", lambda *a, **kw: "#invalid-syntax(")

    with pytest.raises(TypstCompileError) as exc_info:
        render_miniplan_pdf("St. Beispiel", _plan())

    assert exc_info.value.errors
    assert all(isinstance(e, str) and e for e in exc_info.value.errors)
