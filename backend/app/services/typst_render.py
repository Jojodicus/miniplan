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
        kinder = token.get("children", [])
        geordnet = bool(token.get("attrs", {}).get("ordered"))
        item_inhalte = [
            "".join(
                "".join(_markdown_inline_zu_typst(t) for t in block.get("children", []))
                for block in item.get("children", [])
                if block.get("type") in ("block_text", "paragraph")
            )
            for item in kinder
        ]
        # Eine einzelne "1. ..."-Zeile wird nicht als nummerierte Liste formatiert (nur als
        # normaler Text mit der getippten Nummer) - sonst wirkt es z. B. bei einem Datum wie
        # "1. 15.03." als Zeilenanfang ungewollt wie eine Aufzählung. Ab zwei Zeilen ist die
        # Absicht als Liste eindeutig.
        if geordnet and len(kinder) < 2:
            start = token.get("attrs", {}).get("start") or 1
            zeile = f"#{_typst_str(f'{start}. ')}{item_inhalte[0]}" if item_inhalte else ""
            return [zeile]
        # Typst nummeriert `+ `-Einträge automatisch fortlaufend, unabhängig von der im
        # Markdown-Quelltext getippten Zahl - passend dazu, dass die Toolbar immer "1. " einfügt.
        praefix = "+" if geordnet else "-"
        zeilen = [f"{praefix} {inhalt}" for inhalt in item_inhalte]
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


# Weinrot (identisch zur Frontend-Palette --color-wine) für offene Stellen - vergebene Namen
# bleiben bewusst ungefärbt (schwarz auf weiß): eingefärbte Boxen für jeden vergebenen Namen
# kosten beim Druck unnötig Tinte, ohne die Lesbarkeit zu verbessern. Offene Stellen sollen
# dagegen weiterhin auffallen, damit sie beim Blick auf den Plan nicht übersehen werden.
_OFFEN_FARBE = "#7c2f3b"
_OFFEN_FUELLUNG = "#f4e6ea"


def _mini_chip(name: str, *, offen: bool) -> str:
    """Ein vergebener Name erscheint als schlichter schwarzer Text; eine offene Stelle als
    abgesetzter, farbig hinterlegter Chip, damit sie auf dem Plan sofort auffällt."""
    if not offen:
        return f"#{_typst_str(name)}"
    return (
        f'#box(fill: rgb("{_OFFEN_FUELLUNG}"), inset: (x: 5pt, y: 2pt), radius: 2pt, '
        f'outset: (y: 1pt))[#text(fill: rgb("{_OFFEN_FARBE}"), size: 9.5pt)[#{_typst_str(name)}]]'
    )


def _minis_zeile(bedarf: VorschauDienstbedarf) -> str:
    """Baut die Namensliste der zugewiesenen Minis, kommagetrennt für Lesbarkeit (vergebene Namen
    tragen keinen Chip-Hintergrund mehr, der sonst Namensgrenzen markiert hätte); für jede noch
    unbesetzte Stelle ein weinrot eingefärbter „offen“-Chip (analog zu den Platzhaltern im
    Editor)."""
    namen = bedarf.zugewiesene_minis
    fehlend = max(bedarf.anzahl - len(namen), 0)
    if not namen and fehlend == 0:
        return '#text(fill: rgb("#6a6a6a"))[—]'
    eintraege = [_mini_chip(name, offen=False) for name in namen]
    eintraege += [_mini_chip("offen", offen=True) for _ in range(fehlend)]
    # Extra horizontaler Abstand nach dem Komma (statt nur des Zeichenabstands) und größerer
    # Zeilenabstand (`par`) für den Fall, dass die Liste innerhalb der Zelle umbricht - beides
    # macht lange Namenslisten deutlich besser lesbar.
    trenner = '#text(fill: rgb("#8a8a8a"))[,]#h(0.4em)'
    return f"#par(leading: 0.75em)[{trenner.join(eintraege)}]"


def _build_source(pfarrei_name: str, plan: MiniplanVorschauIn) -> str:
    zeilen: list[str] = []
    zeilen.append('#set page(paper: "a4", margin: (x: 2.4cm, y: 2.2cm))')
    zeilen.append('#set text(size: 10.5pt, lang: "de")')
    zeilen.append("#set par(justify: false)")
    titel = f"{pfarrei_name} · {_MONATSNAMEN[plan.monat - 1]} {plan.jahr}"
    zeilen.append("#align(center)[")
    zeilen.append(
        '  #text(size: 16pt, weight: "bold", tracking: 0.3pt)[Miniplan]'
        f'#h(0.6em)#text(size: 12pt, style: "italic", fill: rgb("#4a4a4a"))[#{_typst_str(titel)}]'
    )
    zeilen.append("]")
    zeilen.append("#v(0.4em)")
    zeilen.append('#line(length: 100%, stroke: 0.6pt + rgb("#8a8a8a"))')
    zeilen.append("#v(0.9em)")

    if not plan.gottesdienste:
        zeilen.append(
            '#align(center)[#text(style: "italic", fill: rgb("#6a6a6a"))'
            "[Keine Gottesdienste geplant.]]"
        )

    for gd in plan.gottesdienste:
        wochentag = _WOCHENTAGE[gd.datum.weekday()]
        gd_kopf = f"{wochentag}, {gd.datum.strftime('%d.%m.%Y')} {gd.uhrzeit.strftime('%H:%M')} Uhr"
        if gd.name:
            gd_kopf += f" {gd.name}"
        zeilen.append("#block(above: 0.6em, below: 0.6em, breakable: false)[")
        zeilen.append("  #grid(")
        zeilen.append("    columns: (1fr, auto),")
        zeilen.append("    column-gutter: 0.6em,")
        zeilen.append("    align: (left, right),")
        zeilen.append(f'    text(size: 11.5pt, weight: "bold")[#{_typst_str(gd_kopf)}],')
        if gd.notiz:
            gd_notiz_zelle = (
                'text(style: "italic", size: 9pt, fill: rgb("#6a6a6a"))['
                + _text_zeilen(gd.notiz)
                + "]"
            )
        else:
            gd_notiz_zelle = "[]"
        zeilen.append(f"    {gd_notiz_zelle},")
        zeilen.append("  )")
        zeilen.append("  #v(0.35em)")
        if gd.dienstbedarf:
            # Ein gemeinsames Grid statt eines Blocks je Dienst: nur so teilen sich alle Zeilen
            # eines Gottesdienstes dieselbe Spaltenbreite für die Namen - die Minis-Liste beginnt
            # dadurch unabhängig von der Länge des jeweiligen Dienstnamens auf gleicher Höhe.
            zeilen.append("  #grid(")
            zeilen.append("    columns: (auto, 1fr),")
            zeilen.append("    column-gutter: 10pt,")
            zeilen.append("    row-gutter: 0.55em,")
            for bedarf in gd.dienstbedarf:
                # Ein Dienst ohne Minis (anzahl 0, nichts zugewiesen) dient nur als Hinweiszeile
                # (z. B. "Alle Ministranten") - ohne Doppelpunkt, der sonst ins Leere zeigen würde.
                keine_minis = bedarf.anzahl <= 0 and not bedarf.zugewiesene_minis
                if bedarf.zeige_label and not keine_minis:
                    label_zelle = (
                        f'text(weight: "medium", fill: rgb("#3a3a3a"))[#{_typst_str(bedarf.name)}'
                        f"#{_typst_str(':')}]"
                    )
                elif bedarf.zeige_label:
                    label_zelle = (
                        f'text(weight: "medium", fill: rgb("#3a3a3a"))[#{_typst_str(bedarf.name)}]'
                    )
                else:
                    label_zelle = "[]"
                # Als Grid-Argument muss die Zelle ein gültiger Ausdruck sein, nicht rohes Markup -
                # `_minis_zeile` liefert Markup-Fragmente (führendes `#`), daher in `[...]` gehüllt.
                minis_zelle = "[]" if keine_minis else f"[{_minis_zeile(bedarf)}]"
                zeilen.append(f"    {label_zelle}, {minis_zelle},")
            zeilen.append("  )")
        else:
            zeilen.append(
                '  #text(style: "italic", size: 9pt, fill: rgb("#6a6a6a"))'
                "[Kein Dienstbedarf hinterlegt.]"
            )
        zeilen.append("  #v(0.5em)")
        zeilen.append('  #line(length: 100%, stroke: 0.4pt + rgb("#d6d0c4"))')
        zeilen.append("  #v(0.5em)")
        zeilen.append("]")

    # Jeder Gottesdienst-Block schließt bereits mit einem Trenner ab (siehe oben) - vor
    # Veranstaltungen/Ankündigungen braucht es nur dann einen eigenen, wenn keine Gottesdienste
    # gerendert wurden (sonst doppelte Linie direkt untereinander).
    if plan.veranstaltungen:
        zeilen.append("#v(0.7em)" if plan.gottesdienste else "#v(1.3em)")
        if not plan.gottesdienste:
            zeilen.append('#line(length: 100%, stroke: 0.4pt + rgb("#d6d0c4"))')
            zeilen.append("#v(0.7em)")
        zeilen.append('#text(size: 12pt, weight: "bold")[Veranstaltungen]')
        zeilen.append("#block(above: 0.5em)[" + markdown_to_typst(plan.veranstaltungen) + "]")

    if plan.ankuendigungen:
        zeilen.append("#v(1.3em)")
        # Ein eigener Trenner ist nur nötig, wenn vor dieser Sektion noch nichts gerendert wurde,
        # das bereits mit einer Linie abschließt (weder Gottesdienste noch Veranstaltungen) - sonst
        # entstünde eine doppelte Linie.
        if not plan.veranstaltungen and not plan.gottesdienste:
            zeilen.append('#line(length: 100%, stroke: 0.4pt + rgb("#d6d0c4"))')
            zeilen.append("#v(0.7em)")
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
