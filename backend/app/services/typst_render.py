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
        zeilen: list[str] = []
        for item in token.get("children", []):
            item_inhalt = "".join(
                "".join(_markdown_inline_zu_typst(t) for t in block.get("children", []))
                for block in item.get("children", [])
                if block.get("type") in ("block_text", "paragraph")
            )
            zeilen.append(f"- {item_inhalt}")
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


def _dienstbedarf_bezeichnung(
    bedarf: VorschauDienstbedarf, filtertag_labels: dict[str, str]
) -> str:
    einschraenkungen = [
        filtertag_labels.get(tag, tag) for tag in bedarf.erforderliche_filtertags
    ] + [
        f"mind. {a.mindest_anzahl}× {a.gruppe_name}" for a in bedarf.gruppen_anforderungen
    ]
    if bedarf.zeige_label:
        if einschraenkungen:
            return f"{bedarf.name} ({', '.join(einschraenkungen)})"
        return bedarf.name
    if einschraenkungen:
        return ", ".join(einschraenkungen)
    return "—"


def _build_source(
    pfarrei_name: str, plan: MiniplanVorschauIn, filtertag_labels: dict[str, str]
) -> str:
    zeilen: list[str] = []
    zeilen.append('#set page(paper: "a4", margin: 2cm)')
    zeilen.append('#set text(size: 10pt, lang: "de")')
    zeilen.append("#align(center)[")
    zeilen.append('  #text(size: 18pt, weight: "bold")[Ministranten-Dienstplan]')
    zeilen.append("  #linebreak()")
    titel = f"{pfarrei_name} – {_MONATSNAMEN[plan.monat - 1]} {plan.jahr}"
    zeilen.append(f'  #text(size: 14pt)[#{_typst_str(titel)}]')
    zeilen.append("]")
    zeilen.append("#v(1em)")

    if not plan.gottesdienste:
        zeilen.append('#text(style: "italic")[Keine Gottesdienste geplant.]')

    for gd in plan.gottesdienste:
        gd_titel = f"{gd.datum.strftime('%d.%m.%Y')} {gd.uhrzeit.strftime('%H:%M')} Uhr – {gd.name}"
        zeilen.append("#block(above: 1em, below: 1em)[")
        zeilen.append(f'  #text(size: 12pt, weight: "bold")[#{_typst_str(gd_titel)}]')
        if gd.notiz:
            zeilen.append(
                '  #text(style: "italic", size: 9pt)[' + _text_zeilen(gd.notiz) + "]"
            )
        if gd.dienstbedarf:
            zeilen.append("  #table(")
            zeilen.append("    columns: (1fr, auto, 2fr),")
            zeilen.append("    align: (left, center, left),")
            zeilen.append(
                "    table.header([*Dienst*], [*Anzahl*], [*Zugewiesene Minis*]),"
            )
            for bedarf in gd.dienstbedarf:
                minis_text = ", ".join(bedarf.zugewiesene_minis) if bedarf.zugewiesene_minis else "—"
                bezeichnung = _dienstbedarf_bezeichnung(bedarf, filtertag_labels)
                zeilen.append(
                    f"    [#{_typst_str(bezeichnung)}], [#{_typst_str(str(bedarf.anzahl))}], "
                    f"[#{_typst_str(minis_text)}],"
                )
            zeilen.append("  )")
        else:
            zeilen.append('  #text(style: "italic")[Kein Dienstbedarf hinterlegt.]')
        zeilen.append("]")

    if plan.veranstaltungen:
        zeilen.append("#v(1em)")
        zeilen.append('#text(size: 12pt, weight: "bold")[Veranstaltungen]')
        zeilen.append("#block(above: 0.5em)[" + markdown_to_typst(plan.veranstaltungen) + "]")

    if plan.ankuendigungen:
        zeilen.append("#v(1em)")
        zeilen.append('#text(size: 12pt, weight: "bold")[Ankündigungen]')
        zeilen.append("#block(above: 0.5em)[" + markdown_to_typst(plan.ankuendigungen) + "]")

    return "\n".join(zeilen)


def _parse_fehler(stderr: str) -> list[str]:
    treffer = _ERROR_ZEILE.findall(stderr)
    if treffer:
        return treffer
    return [stderr.strip() or "Unbekannter Typst-Fehler"]


def render_miniplan_pdf(
    pfarrei_name: str,
    plan: MiniplanVorschauIn,
    filtertag_labels: dict[str, str] | None = None,
) -> bytes:
    quelltext = _build_source(pfarrei_name, plan, filtertag_labels or {})
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
