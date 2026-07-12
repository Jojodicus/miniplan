from datetime import date, time

import pytest

from app.schemas.miniplan_vorschau import (
    MiniplanVorschauIn,
    VorschauDienstbedarf,
    VorschauGottesdienst,
    VorschauGruppenAnforderung,
)
from app.services.typst_render import (
    TypstCompileError,
    _build_source,
    _minis_zeile,
    markdown_to_typst,
    render_miniplan_pdf,
)


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


def test_render_gottesdienst_ohne_namen_liefert_pdf() -> None:
    plan = _plan(
        gottesdienste=[
            VorschauGottesdienst(datum=date(2026, 7, 5), uhrzeit=time(10, 0), name=None)
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


def test_render_mit_zeige_label_false_und_notiz_liefert_pdf() -> None:
    plan = _plan(
        gottesdienste=[
            VorschauGottesdienst(
                datum=date(2026, 7, 5),
                uhrzeit=time(10, 0),
                name="Sonntagsmesse",
                notiz="Bitte Kerzen mitbringen",
                dienstbedarf=[
                    VorschauDienstbedarf(name="Sonntagsmesse", anzahl=4, zeige_label=False)
                ],
            )
        ],
    )
    pdf = render_miniplan_pdf("St. Beispiel", plan)
    assert pdf.startswith(b"%PDF")


def test_minis_zeile_leere_stelle_ohne_zuweisung_zeigt_trennwert() -> None:
    # Anzahl 0 und keine Minis: neutraler Trennwert, kein Platzhalter.
    bedarf = VorschauDienstbedarf(name="Weihrauch", anzahl=0, zugewiesene_minis=[])
    assert _minis_zeile(bedarf) == '#text(fill: rgb("#6a6a6a"))[—]'


def test_minis_zeile_offene_stellen_als_weinrote_chips() -> None:
    # Zwei von drei Stellen besetzt -> ein weinroter "offen"-Chip, Namen escaped.
    bedarf = VorschauDienstbedarf(
        name="Messdiener", anzahl=3, zugewiesene_minis=["Anna", "Bea"]
    )
    zeile = _minis_zeile(bedarf)
    assert '#"Anna"' in zeile
    assert '#"Bea"' in zeile
    assert zeile.count('rgb("#7c2f3b")') == 1
    assert '#"offen"' in zeile


def test_minis_zeile_alle_stellen_offen() -> None:
    bedarf = VorschauDienstbedarf(name="Messdiener", anzahl=2, zugewiesene_minis=[])
    zeile = _minis_zeile(bedarf)
    assert zeile.count('#"offen"') == 2


def test_render_mit_offenen_stellen_liefert_pdf() -> None:
    plan = _plan(
        gottesdienste=[
            VorschauGottesdienst(
                datum=date(2026, 7, 5),
                uhrzeit=time(10, 0),
                name="Sonntagsmesse",
                dienstbedarf=[
                    VorschauDienstbedarf(name="Messdiener", anzahl=4, zugewiesene_minis=["Anna"])
                ],
            )
        ],
    )
    pdf = render_miniplan_pdf("St. Beispiel", plan)
    assert pdf.startswith(b"%PDF")


def test_render_dienst_ohne_minis_zeigt_namen_ohne_doppelpunkt() -> None:
    # Ein Dienst mit anzahl=0 und ohne Zuweisungen dient nur als Hinweiszeile (z. B. "Alle
    # Ministranten") - ein Doppelpunkt oder ein Leerstellen-Platzhalter wäre hier irreführend.
    plan = _plan(
        gottesdienste=[
            VorschauGottesdienst(
                datum=date(2026, 7, 5),
                uhrzeit=time(10, 0),
                name="Sonntagsmesse",
                dienstbedarf=[
                    VorschauDienstbedarf(name="Alle Ministranten", anzahl=0, zugewiesene_minis=[])
                ],
            )
        ],
    )
    quelltext = _build_source("St. Beispiel", plan)
    assert '#"Alle Ministranten"]' in quelltext
    assert '#"Alle Ministranten"#":"]' not in quelltext
    pdf = render_miniplan_pdf("St. Beispiel", plan)
    assert pdf.startswith(b"%PDF")


def test_markdown_to_typst_fett() -> None:
    ergebnis = markdown_to_typst("Hallo **fett** Welt")
    assert ergebnis == '#"Hallo "*#"fett"*#" Welt"'


def test_markdown_to_typst_kursiv() -> None:
    ergebnis = markdown_to_typst("Hallo *kursiv* Welt")
    assert ergebnis == '#"Hallo "_#"kursiv"_#" Welt"'


def test_markdown_to_typst_liste() -> None:
    ergebnis = markdown_to_typst("- Punkt eins\n- Punkt zwei")
    assert ergebnis == '- #"Punkt eins"\n- #"Punkt zwei"'


def test_markdown_to_typst_nummerierte_liste() -> None:
    ergebnis = markdown_to_typst("1. Punkt eins\n2. Punkt zwei")
    assert ergebnis == '+ #"Punkt eins"\n+ #"Punkt zwei"'


def test_markdown_to_typst_link() -> None:
    ergebnis = markdown_to_typst("[Anmeldung](https://example.com/anmeldung)")
    assert ergebnis == '#link("https://example.com/anmeldung")[#"Anmeldung"]'


def test_markdown_to_typst_einfacher_absatz() -> None:
    ergebnis = markdown_to_typst("Nur ein normaler Satz ohne Markdown.")
    assert ergebnis == '#"Nur ein normaler Satz ohne Markdown."'


def test_markdown_to_typst_escaped_typst_sonderzeichen() -> None:
    # Kritisch: literale Typst-Sonderzeichen (#, ", \) im Nutzertext dürfen niemals roh
    # verkettet werden, sondern müssen als Typst-String-Literal escaped bleiben - sonst
    # wäre eine Typst-Code-Injection über Freitext möglich (siehe CLAUDE.md).
    ergebnis = markdown_to_typst('Text mit "Anführung", #include("x") und \\ Backslash')
    assert ergebnis == '#"Text mit \\"Anführung\\", #include(\\"x\\") und \\\\ Backslash"'
    # Es darf kein rohes, unescaped "#include(" oder ein einzelnes literales "-Zeichen
    # außerhalb eines String-Literals im Ergebnis vorkommen.
    assert "#include(" not in ergebnis.replace('#include(\\"x\\")', "")


def test_markdown_to_typst_kombiniert_liste_und_absaetze_liefert_gueltiges_pdf() -> None:
    plan = _plan(
        veranstaltungen="**Wichtig:**\n\n- Punkt eins\n- Punkt zwei mit *Betonung*",
        ankuendigungen='Sonderzeichen: "Test" #eval \\ Ende',
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
