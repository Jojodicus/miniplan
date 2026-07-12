import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import mistune

from app.schemas.miniplan_vorschau import MiniplanVorschauIn, VorschauDienstbedarf

_MONATSNAMEN = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
]

_WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]

_ERROR_ZEILE = re.compile(r"^error: (.+)$", re.MULTILINE)


class TypstCompileError(Exception):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def _typst_str(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _text_zeilen(text: str) -> str:
    zeilen = text.split("\n")
    teile = []
    for i, zeile in enumerate(zeilen):
        if i > 0:
            teile.append("#linebreak()")
        teile.append(f"#{_typst_str(zeile)}")
    return "".join(teile)


_markdown_parser = mistune.create_markdown(renderer=None)


def _markdown_inline_zu_typst(token: dict[str, Any]) -> str:
    typ = token.get("type")
    if typ == "text":
        return f"#{_typst_str(token.get('raw', ''))}"
    if typ in ("softbreak", "linebreak"):
        return "#linebreak()"
    if typ == "strong":
        kinder = "".join(_markdown_inline_zu_typst(t) for t in token.get("children", []))
        return f"*{kinder}*"
    if typ == "emphasis":
        kinder = "".join(_markdown_inline_zu_typst(t) for t in token.get("children", []))
        return f"_{kinder}_"
    if typ == "codespan":
        return f"#{_typst_str(token.get('raw', ''))}"
    if typ == "link":
        kinder = "".join(_markdown_inline_zu_typst(t) for t in token.get("children", []))
        url = token.get("attrs", {}).get("url", "")
        return f"#link({_typst_str(url)})[{kinder}]"
    # unbekannter/unterstützter Inline-Knoten: Rohtext (falls vorhanden) sicher escapen,
    # sonst ignorieren - nie unescapte Kindinhalte roh verketten.
    if "raw" in token:
        return f"#{_typst_str(token['raw'])}"
    return "".join(_markdown_inline_zu_typst(t) for t in token.get("children", []))


def _markdown_block_zu_typst(token: dict[str, Any]) -> list[str]:
    typ = token.get("type")
    if typ == "paragraph":
        inhalt = "".join(_markdown_inline_zu_typst(t) for t in token.get("children", []))
        return [inhalt]
    if typ == "blank_line":
        return []
    if typ == "list":
        # Typst nummeriert `+ `-Einträge automatisch fortlaufend, unabhängig von der im
        # Markdown-Quelltext getippten Zahl - passend dazu, dass die Toolbar immer "1. " einfügt.
        praefix = "+" if token.get("attrs", {}).get("ordered") else "-"
        zeilen: list[str] = []
        for item in token.get("children", []):
            item_inhalt = "".join(
                "".join(_markdown_inline_zu_typst(t) for t in block.get("children", []))
                for block in item.get("children", [])
                if block.get("type") in ("block_text", "paragraph")
            )
            zeilen.append(f"{praefix} {item_inhalt}")
        return ["\n".join(zeilen)]
    if typ == "heading":
        inhalt = "".join(_markdown_inline_zu_typst(t) for t in token.get("children", []))
        return [f'#text(weight: "bold")[{inhalt}]']
    if typ == "block_code":
        return [f"#{_typst_str(token.get('raw', ''))}"]
    # Fallback: falls doch Kinder vorhanden sind, deren Inline-Inhalt sicher rendern.
    if "children" in token:
        inhalt = "".join(_markdown_inline_zu_typst(t) for t in token.get("children", []))
        return [inhalt] if inhalt else []
    return []


def markdown_to_typst(text: str) -> str:
    """Wandelt eine kleine, sichere Markdown-Teilmenge (fett, kursiv, Aufzählungen,
    Absätze) in Typst-Markup um. Jeder literale Textlauf wird dabei zwingend über
    `_typst_str` als Typst-String-Literal escaped (`#"..."`), sodass auch hier keine
    Typst-Code-Injection über Freitext möglich ist - analog zu `_text_zeilen`.
    """
    tokens = _markdown_parser(text)
    bloecke: list[str] = []
    for token in tokens:
        for zeile in _markdown_block_zu_typst(token):
            if zeile:
                bloecke.append(zeile)
    return "\n#linebreak()\n".join(bloecke)


# Weinrot (identisch zur Frontend-Palette --color-wine), damit noch offene Stellen auf dem PDF
# genauso hervorstechen wie die Platzhalter im Editor.
_OFFEN_FARBE = '#7c2f3b'


def _minis_zelle(bedarf: VorschauDienstbedarf) -> str:
    """Baut den Inhalt der „Zugewiesene Minis“-Zelle: vergebene Namen in Normalschrift, für jede
    noch unbesetzte Stelle einen weinrot eingefärbten „offen“-Platzhalter (analog zu den
    Platzhaltern im Editor)."""
    namen = bedarf.zugewiesene_minis
    fehlend = max(bedarf.anzahl - len(namen), 0)
    if not namen and fehlend == 0:
        return "—"
    teile: list[str] = []
    for i, name in enumerate(namen):
        if i > 0:
            teile.append('#", "')
        teile.append(f"#{_typst_str(name)}")
    for j in range(fehlend):
        if teile or j > 0:
            teile.append('#", "')
        teile.append(f'#text(fill: rgb("{_OFFEN_FARBE}"))[#{_typst_str("offen")}]')
    return "".join(teile)


def _build_source(pfarrei_name: str, plan: MiniplanVorschauIn) -> str:
    zeilen: list[str] = []
    zeilen.append('#set page(paper: "a4", margin: (x: 2.4cm, y: 2.2cm))')
    zeilen.append('#set text(size: 10.5pt, lang: "de")')
    zeilen.append('#set par(justify: false)')
    zeilen.append("#align(center)[")
    zeilen.append('  #text(size: 20pt, weight: "bold", tracking: 0.5pt)[Dienstplan]')
    zeilen.append("  #v(0.15em)")
    titel = f"{pfarrei_name} · {_MONATSNAMEN[plan.monat - 1]} {plan.jahr}"
    zeilen.append(f'  #text(size: 12.5pt, style: "italic", fill: rgb("#4a4a4a"))[#{_typst_str(titel)}]')
    zeilen.append("]")
    zeilen.append("#v(0.5em)")
    zeilen.append('#line(length: 100%, stroke: 0.6pt + rgb("#8a8a8a"))')
    zeilen.append("#v(1.1em)")

    if not plan.gottesdienste:
        zeilen.append('#align(center)[#text(style: "italic", fill: rgb("#6a6a6a"))[Keine Gottesdienste geplant.]]')

    for gd in plan.gottesdienste:
        wochentag = _WOCHENTAGE[gd.datum.weekday()]
        gd_datum = f"{wochentag}, {gd.datum.strftime('%d.%m.%Y')}"
        gd_uhrzeit = f"{gd.uhrzeit.strftime('%H:%M')} Uhr"
        zeilen.append("#block(above: 1.3em, below: 0.9em, breakable: false)[")
        zeilen.append("  #grid(")
        zeilen.append("    columns: (auto, 1fr),")
        zeilen.append("    column-gutter: 0.6em,")
        zeilen.append(
            f'    text(size: 12pt, weight: "bold")[#{_typst_str(gd_datum)}],'
        )
        if gd.name:
            gd_name_zelle = f'text(size: 11pt, fill: rgb("#4a4a4a"))[#{_typst_str(gd.name)}]'
        else:
            gd_name_zelle = "[]"
        zeilen.append(f"    {gd_name_zelle},")
        zeilen.append("  )")
        zeilen.append(f'  #text(size: 10pt, fill: rgb("#6a6a6a"))[#{_typst_str(gd_uhrzeit)}]')
        if gd.notiz:
            zeilen.append(
                '  #text(style: "italic", size: 9pt, fill: rgb("#6a6a6a"))[' + _text_zeilen(gd.notiz) + "]"
            )
        zeilen.append("  #v(0.5em)")
        if gd.dienstbedarf:
            zeilen.append("  #table(")
            zeilen.append("    columns: (5.2cm, 1fr),")
            zeilen.append("    stroke: (x, y) => (bottom: 0.4pt + rgb(\"#d6d0c4\")),")
            zeilen.append("    inset: (x: 0pt, y: 5pt),")
            zeilen.append("    align: (left + horizon, left + horizon),")
            for bedarf in gd.dienstbedarf:
                minis_zelle = _minis_zelle(bedarf)
                if bedarf.zeige_label:
                    dienst_zelle = (
                        f'#text(weight: "medium", fill: rgb("#3a3a3a"))[#{_typst_str(bedarf.name)}]'
                    )
                else:
                    dienst_zelle = ""
                zeilen.append(f"    [{dienst_zelle}], [{minis_zelle}],")
            zeilen.append("  )")
        else:
            zeilen.append('  #text(style: "italic", size: 9pt, fill: rgb("#6a6a6a"))[Kein Dienstbedarf hinterlegt.]')
        zeilen.append("]")

    if plan.veranstaltungen:
        zeilen.append("#v(1.3em)")
        zeilen.append('#line(length: 100%, stroke: 0.4pt + rgb("#d6d0c4"))')
        zeilen.append('#v(0.7em)')
        zeilen.append('#text(size: 12pt, weight: "bold")[Veranstaltungen]')
        zeilen.append("#block(above: 0.5em)[" + markdown_to_typst(plan.veranstaltungen) + "]")

    if plan.ankuendigungen:
        zeilen.append("#v(1.3em)")
        if not plan.veranstaltungen:
            zeilen.append('#line(length: 100%, stroke: 0.4pt + rgb("#d6d0c4"))')
            zeilen.append('#v(0.7em)')
        zeilen.append('#text(size: 12pt, weight: "bold")[Ankündigungen]')
        zeilen.append("#block(above: 0.5em)[" + markdown_to_typst(plan.ankuendigungen) + "]")

    return "\n".join(zeilen)


def _parse_fehler(stderr: str) -> list[str]:
    treffer = _ERROR_ZEILE.findall(stderr)
    if treffer:
        return treffer
    return [stderr.strip() or "Unbekannter Typst-Fehler"]


def render_miniplan_pdf(pfarrei_name: str, plan: MiniplanVorschauIn) -> bytes:
    quelltext = _build_source(pfarrei_name, plan)
    with tempfile.TemporaryDirectory() as tmp_dir:
        quelldatei = Path(tmp_dir) / "miniplan.typ"
        quelldatei.write_text(quelltext, encoding="utf-8")
        ausgabedatei = Path(tmp_dir) / "miniplan.pdf"
        ergebnis = subprocess.run(
            ["typst", "compile", str(quelldatei), str(ausgabedatei)],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if ergebnis.returncode != 0:
            raise TypstCompileError(_parse_fehler(ergebnis.stderr))
        return ausgabedatei.read_bytes()
