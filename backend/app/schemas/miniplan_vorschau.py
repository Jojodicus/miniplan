from datetime import date, time
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from app.models.miniplan import Miniplan


class VorschauGruppenAnforderung(BaseModel):
    gruppe_name: str
    mindest_anzahl: int = Field(ge=0)


class VorschauDienstbedarf(BaseModel):
    name: str
    anzahl: int = Field(ge=0)
    erforderliche_filtertags: list[str] = []
    gruppen_anforderungen: list[VorschauGruppenAnforderung] = []
    zugewiesene_minis: list[str] = []
    zeige_label: bool = True


class VorschauGottesdienst(BaseModel):
    datum: date
    uhrzeit: time
    name: str | None = None
    notiz: str | None = None
    dienstbedarf: list[VorschauDienstbedarf] = []


class MiniplanVorschauIn(BaseModel):
    monat: int = Field(ge=1, le=12)
    jahr: int = Field(ge=2000)
    veranstaltungen: str | None = None
    ankuendigungen: str | None = None
    gottesdienste: list[VorschauGottesdienst] = []


def miniplan_zu_vorschau(miniplan: "Miniplan") -> MiniplanVorschauIn:
    """Baut aus dem gespeicherten Planstand dieselbe Struktur, die das Frontend für die
    Live-Vorschau schickt, damit `render_miniplan_pdf` für Vorschau und finalen Download
    identisch verwendet werden kann."""
    return MiniplanVorschauIn(
        monat=miniplan.monat,
        jahr=miniplan.jahr,
        veranstaltungen=miniplan.veranstaltungen,
        ankuendigungen=miniplan.ankuendigungen,
        gottesdienste=[
            VorschauGottesdienst(
                datum=gd.datum,
                uhrzeit=gd.uhrzeit,
                name=gd.name,
                notiz=gd.notiz,
                dienstbedarf=[
                    VorschauDienstbedarf(
                        name=bedarf.dienst_typ.name if bedarf.dienst_typ else (bedarf.name or ""),
                        anzahl=bedarf.anzahl,
                        erforderliche_filtertags=bedarf.erforderliche_filtertags,
                        gruppen_anforderungen=[
                            VorschauGruppenAnforderung(
                                gruppe_name=anforderung.gruppe.name,
                                mindest_anzahl=anforderung.mindest_anzahl,
                            )
                            for anforderung in bedarf.gruppen_anforderungen
                        ],
                        zugewiesene_minis=[mini.name for mini in bedarf.zugewiesene_minis],
                        zeige_label=bedarf.zeige_label,
                    )
                    for bedarf in gd.dienstbedarf
                ],
            )
            for gd in miniplan.gottesdienste
        ],
    )
