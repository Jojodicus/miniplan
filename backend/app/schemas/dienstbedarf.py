from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.dienst_typ import GruppenAnforderung, GruppenAnforderungOut
from app.schemas.mini import MiniOut


class DienstbedarfIn(BaseModel):
    dienst_typ_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    anzahl: int = Field(ge=1)
    erforderliche_filtertags: list[str] = []
    gruppen_anforderungen: list[GruppenAnforderung] = []
    fixierte_mini_ids: list[int] = []
    # Automatisch (nicht manuell) zugewiesene Minis werden vom Frontend hier unverändert
    # durchgereicht (nicht über die Checkbox-Auswahl editierbar) - so überleben sie ein Speichern
    # anderer Felder desselben Dienstbedarfs, statt beim nächsten PUT verloren zu gehen.
    auto_mini_ids: list[int] = []
    zeige_label: bool = True

    @model_validator(mode="after")
    def _entweder_dienst_typ_oder_name(self) -> "DienstbedarfIn":
        if (self.dienst_typ_id is None) == (self.name is None):
            raise ValueError(
                "Entweder dienst_typ_id oder name muss gesetzt sein, nicht beides oder keines"
            )
        for anforderung in self.gruppen_anforderungen:
            if anforderung.mindest_anzahl > self.anzahl:
                raise ValueError(
                    "Die Mindestanzahl einer Gruppe darf die Anzahl nicht überschreiten"
                )
        summe = sum(a.mindest_anzahl for a in self.gruppen_anforderungen)
        if summe > self.anzahl:
            raise ValueError(
                "Die Summe der Mindestanzahlen darf die Anzahl nicht überschreiten"
            )
        if set(self.fixierte_mini_ids) & set(self.auto_mini_ids):
            raise ValueError(
                "Ein Mini kann nicht gleichzeitig fest und automatisch zugewiesen sein"
            )
        if len(self.fixierte_mini_ids) + len(self.auto_mini_ids) > self.anzahl:
            raise ValueError(
                "Es dürfen nicht mehr Minis zugewiesen werden als die Anzahl vorgibt"
            )
        return self


class DienstTypSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class DienstbedarfZuweisungOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mini: MiniOut
    manuell_fixiert: bool


class DienstbedarfOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dienst_typ: DienstTypSummary | None
    name: str | None
    anzahl: int
    erforderliche_filtertags: list[str]
    gruppen_anforderungen: list[GruppenAnforderungOut]
    zuweisungen: list[DienstbedarfZuweisungOut]
    zeige_label: bool


class ZuweisungTauschenIn(BaseModel):
    zuweisung_id_a: int
    zuweisung_id_b: int


class ZuweisungFixierungIn(BaseModel):
    manuell_fixiert: bool


class ZuweisungenLeerenIn(BaseModel):
    # Nur automatisch (nicht manuell fixierte) Zuweisungen werden gelöscht. Ohne Einschränkung
    # betrifft das den ganzen Plan; mit `gottesdienst_id` nur diesen Gottesdienst, mit
    # `dienstbedarf_id` nur diesen einen Dienstbedarf.
    gottesdienst_id: int | None = None
    dienstbedarf_id: int | None = None
