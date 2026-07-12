import math
import random
from dataclasses import dataclass
from datetime import date, time

from sqlalchemy.orm import Session

from app.models.filtertag import Filtertag
from app.models.mini import Mini
from app.models.miniplan import Miniplan
from app.services.verfuegbarkeit import ist_blockiert

# Freie Plätze bleiben so gut wie nie unbesetzt, wenn ein passender Mini existiert: die Strafe für
# eine unbesetzte Stelle dominiert klar gegenüber Fairness/Abstand, die nur zwischen bereits
# besetzten Stellen abwägen.
_UNBESETZT_STRAFE = 1000.0
_ABSTAND_STRAFE = 3.0


@dataclass
class ZuteilungConfig:
    """Aus dem Miniplan abgeleitete Gewichte der automatischen Zuteilung. Die Defaults
    reproduzieren das ursprüngliche, fest verdrahtete Verhalten."""

    fairness_gewicht: float = 1.0
    mindestabstand_tage: int = 6
    mixing_gewicht: float = 0.0
    wiederholung_gewicht: float = 0.0

    @classmethod
    def aus_miniplan(cls, miniplan: Miniplan) -> "ZuteilungConfig":
        return cls(
            fairness_gewicht=miniplan.fairness_gewicht,
            mindestabstand_tage=miniplan.mindestabstand_tage,
            mixing_gewicht=miniplan.mixing_gewicht,
            wiederholung_gewicht=miniplan.wiederholung_gewicht,
        )


@dataclass
class _Slot:
    """Eine einzelne zu besetzende Stelle innerhalb eines Dienstbedarfs (von dessen `anzahl`
    abgeleitet). `quota_gruppe_id` ist gesetzt, wenn diese Stelle zur Erfüllung einer
    Gruppen-Mindestanzahl reserviert wurde. `signatur` identifiziert den wiederkehrenden Dienst
    (gleicher Dienst-Typ/Name + Uhrzeit) für die Wiederholungs-Wertung."""

    dienstbedarf_id: int
    gottesdienst_id: int
    datum: date
    zeit: time
    erforderliche_filtertags: frozenset[str]
    quota_gruppe_id: int | None
    signatur: tuple[object, ...]
    mini_id: int | None = None


def _mini_passt(
    mini: Mini,
    slot: _Slot,
    belegte_minis: set[int],
    ist_mini_blockiert,
) -> bool:
    if slot.quota_gruppe_id is not None and mini.gruppe_id != slot.quota_gruppe_id:
        return False
    if slot.erforderliche_filtertags and not (set(mini.filtertags) & slot.erforderliche_filtertags):
        return False
    if mini.id in belegte_minis:
        return False
    return not ist_mini_blockiert(mini, slot.datum, slot.zeit)


def _badness(
    slots: list[_Slot],
    einsatz_anzahl: dict[int, int],
    config: ZuteilungConfig,
    fixierte_belegung: list[tuple[int, tuple[object, ...], int]],
) -> float:
    unbesetzt = sum(1 for s in slots if s.mini_id is None)

    anzahl_minis = len(einsatz_anzahl) or 1
    mittelwert = sum(einsatz_anzahl.values()) / anzahl_minis
    varianz = sum((wert - mittelwert) ** 2 for wert in einsatz_anzahl.values()) / anzahl_minis

    termine_je_mini: dict[int, list[date]] = {}
    for slot in slots:
        if slot.mini_id is not None:
            termine_je_mini.setdefault(slot.mini_id, []).append(slot.datum)
    naehe_strafe = 0.0
    for termine in termine_je_mini.values():
        termine.sort()
        for davor, danach in zip(termine, termine[1:]):
            abstand = (danach - davor).days
            if abstand < config.mindestabstand_tage:
                naehe_strafe += _ABSTAND_STRAFE * (config.mindestabstand_tage - abstand)

    mixing_strafe = 0.0
    wiederholung_bonus = 0.0
    if config.mixing_gewicht or config.wiederholung_gewicht:
        # Aktuelle Belegung (freie Stellen) mit den fixierten zusammenführen, damit beide Wertungen
        # den vollständigen Plan sehen (auch das Paaren mit einem fixierten Mini zählt).
        belegte_minis_je_gottesdienst: dict[int, set[int]] = {}
        signaturen_je_mini: dict[int, list[tuple[object, ...]]] = {}
        for slot in slots:
            if slot.mini_id is None:
                continue
            belegte_minis_je_gottesdienst.setdefault(slot.gottesdienst_id, set()).add(slot.mini_id)
            signaturen_je_mini.setdefault(slot.mini_id, []).append(slot.signatur)
        for gottesdienst_id, signatur, mini_id in fixierte_belegung:
            belegte_minis_je_gottesdienst.setdefault(gottesdienst_id, set()).add(mini_id)
            signaturen_je_mini.setdefault(mini_id, []).append(signatur)

        if config.mixing_gewicht:
            paar_anzahl: dict[tuple[int, int], int] = {}
            for minis_im_gottesdienst in belegte_minis_je_gottesdienst.values():
                sortiert = sorted(minis_im_gottesdienst)
                for i, a in enumerate(sortiert):
                    for b in sortiert[i + 1 :]:
                        paar_anzahl[(a, b)] = paar_anzahl.get((a, b), 0) + 1
            # Progressiv steigende Strafe: jedes wiederholte Zusammentreffen desselben Paares
            # wiegt mehr als das erste (count*(count-1)/2).
            mixing_strafe = sum(n * (n - 1) / 2 for n in paar_anzahl.values())

        if config.wiederholung_gewicht:
            for signaturen in signaturen_je_mini.values():
                haeufigkeit: dict[tuple[object, ...], int] = {}
                for sig in signaturen:
                    haeufigkeit[sig] = haeufigkeit.get(sig, 0) + 1
                # Bonus für Treue zu derselben Dienst-Signatur (jede Wiederholung über die erste
                # hinaus).
                wiederholung_bonus += sum(n - 1 for n in haeufigkeit.values())

    return (
        unbesetzt * _UNBESETZT_STRAFE
        + varianz * config.fairness_gewicht
        + naehe_strafe
        + mixing_strafe * config.mixing_gewicht
        - wiederholung_bonus * config.wiederholung_gewicht
    )


def _akzeptieren(alte_badness: float, neue_badness: float, temperatur: float, zufall: random.Random) -> bool:
    if neue_badness <= alte_badness:
        return True
    if temperatur <= 0:
        return False
    return zufall.random() < math.exp((alte_badness - neue_badness) / temperatur)


def _baue_slots(miniplan: Miniplan, minis_by_id: dict[int, Mini]) -> tuple[list[_Slot], dict[int, set[int]]]:
    slots: list[_Slot] = []
    belegt_je_gottesdienst: dict[int, set[int]] = {}

    for gottesdienst in miniplan.gottesdienste:
        belegte_minis = belegt_je_gottesdienst.setdefault(gottesdienst.id, set())
        for bedarf in gottesdienst.dienstbedarf:
            fixierte = [z for z in bedarf.zuweisungen if z.manuell_fixiert]
            for zuweisung in fixierte:
                belegte_minis.add(zuweisung.mini_id)

            fixiert_je_gruppe: dict[int, int] = {}
            for zuweisung in fixierte:
                mini = minis_by_id.get(zuweisung.mini_id)
                if mini is not None:
                    fixiert_je_gruppe[mini.gruppe_id] = fixiert_je_gruppe.get(mini.gruppe_id, 0) + 1

            anzahl_frei = bedarf.anzahl - len(fixierte)
            quoten: list[int | None] = []
            for anforderung in bedarf.gruppen_anforderungen:
                defizit = anforderung.mindest_anzahl - fixiert_je_gruppe.get(anforderung.gruppe_id, 0)
                for _ in range(max(0, defizit)):
                    if len(quoten) < anzahl_frei:
                        quoten.append(anforderung.gruppe_id)
            while len(quoten) < anzahl_frei:
                quoten.append(None)
            # Stellen mit Gruppen-Quote zuerst besetzen, damit knappe Gruppen nicht durch
            # großzügig vergebene freie Stellen blockiert werden.
            quoten.sort(key=lambda g: g is None)

            erforderlich = frozenset(bedarf.erforderliche_filtertags)
            signatur = (bedarf.dienst_typ_id, bedarf.name, gottesdienst.uhrzeit)
            for quota_gruppe_id in quoten:
                slots.append(
                    _Slot(
                        dienstbedarf_id=bedarf.id,
                        gottesdienst_id=gottesdienst.id,
                        datum=gottesdienst.datum,
                        zeit=gottesdienst.uhrzeit,
                        erforderliche_filtertags=erforderlich,
                        quota_gruppe_id=quota_gruppe_id,
                        signatur=signatur,
                    )
                )

    return slots, belegt_je_gottesdienst


def _greedy_konstruktion(
    slots: list[_Slot],
    minis: list[Mini],
    einsatz_anzahl: dict[int, int],
    belegt_je_gottesdienst: dict[int, set[int]],
    ist_mini_blockiert,
    zufall: random.Random,
) -> None:
    for slot in slots:
        belegte = belegt_je_gottesdienst[slot.gottesdienst_id]
        kandidaten = [m for m in minis if _mini_passt(m, slot, belegte, ist_mini_blockiert)]
        if not kandidaten:
            continue
        minimaler_einsatz = min(einsatz_anzahl[m.id] for m in kandidaten)
        beste = [m for m in kandidaten if einsatz_anzahl[m.id] == minimaler_einsatz]
        gewaehlt = zufall.choice(beste)
        slot.mini_id = gewaehlt.id
        einsatz_anzahl[gewaehlt.id] += 1
        belegt_je_gottesdienst[slot.gottesdienst_id].add(gewaehlt.id)


def _simulated_annealing(
    slots: list[_Slot],
    minis: list[Mini],
    minis_by_id: dict[int, Mini],
    einsatz_anzahl: dict[int, int],
    belegt_je_gottesdienst: dict[int, set[int]],
    ist_mini_blockiert,
    zufall: random.Random,
    config: ZuteilungConfig,
    fixierte_belegung: list[tuple[int, tuple[object, ...], int]],
) -> None:
    besetzte = [s for s in slots if s.mini_id is not None]
    if len(besetzte) < 2:
        return

    iterationen = min(6000, max(200, len(besetzte) * 150))
    temperatur = 4.0
    # Abkühlung so gewählt, dass die Temperatur über die volle Iterationszahl gegen ~0 geht -
    # sonst werden bis zum Schluss verschlechternde Züge akzeptiert (Sinn von Simulated
    # Annealing), aber das Endergebnis wäre dann nicht mehr das beste gefundene. Deshalb zusätzlich
    # unten der beste je gesehene Zustand separat gemerkt und am Ende wiederhergestellt.
    abkuehlung = (0.001 / temperatur) ** (1 / iterationen)
    aktuelle_badness = _badness(slots, einsatz_anzahl, config, fixierte_belegung)
    beste_badness = aktuelle_badness
    beste_zuweisung = [s.mini_id for s in slots]

    def _beste_ggf_merken() -> None:
        nonlocal beste_badness, beste_zuweisung
        if aktuelle_badness < beste_badness:
            beste_badness = aktuelle_badness
            beste_zuweisung = [s.mini_id for s in slots]

    for _ in range(iterationen):
        temperatur *= abkuehlung
        if zufall.random() < 0.5:
            a, b = zufall.sample(besetzte, 2)
            if a.gottesdienst_id == b.gottesdienst_id:
                continue
            mini_a, mini_b = minis_by_id[a.mini_id], minis_by_id[b.mini_id]
            belegte_a = belegt_je_gottesdienst[a.gottesdienst_id] - {a.mini_id}
            belegte_b = belegt_je_gottesdienst[b.gottesdienst_id] - {b.mini_id}
            if not _mini_passt(mini_b, a, belegte_a, ist_mini_blockiert):
                continue
            if not _mini_passt(mini_a, b, belegte_b, ist_mini_blockiert):
                continue

            alte_a, alte_b = a.mini_id, b.mini_id
            _setze_slot(a, mini_b.id, belegt_je_gottesdienst)
            _setze_slot(b, mini_a.id, belegt_je_gottesdienst)
            neue_badness = _badness(slots, einsatz_anzahl, config, fixierte_belegung)
            if _akzeptieren(aktuelle_badness, neue_badness, temperatur, zufall):
                aktuelle_badness = neue_badness
                _beste_ggf_merken()
            else:
                _setze_slot(a, alte_a, belegt_je_gottesdienst)
                _setze_slot(b, alte_b, belegt_je_gottesdienst)
        else:
            slot = zufall.choice(besetzte)
            belegte_ohne_eigene = belegt_je_gottesdienst[slot.gottesdienst_id] - {slot.mini_id}
            kandidaten = [
                m
                for m in minis
                if m.id != slot.mini_id and _mini_passt(m, slot, belegte_ohne_eigene, ist_mini_blockiert)
            ]
            if not kandidaten:
                continue
            kandidat = zufall.choice(kandidaten)
            alter_mini_id = slot.mini_id
            _setze_slot(slot, kandidat.id, belegt_je_gottesdienst)
            einsatz_anzahl[alter_mini_id] -= 1
            einsatz_anzahl[kandidat.id] += 1
            neue_badness = _badness(slots, einsatz_anzahl, config, fixierte_belegung)
            if _akzeptieren(aktuelle_badness, neue_badness, temperatur, zufall):
                aktuelle_badness = neue_badness
                _beste_ggf_merken()
            else:
                _setze_slot(slot, alter_mini_id, belegt_je_gottesdienst)
                einsatz_anzahl[alter_mini_id] += 1
                einsatz_anzahl[kandidat.id] -= 1

    for slot, mini_id in zip(slots, beste_zuweisung):
        slot.mini_id = mini_id


def _setze_slot(slot: _Slot, neuer_mini_id: int, belegt_je_gottesdienst: dict[int, set[int]]) -> None:
    if slot.mini_id is not None:
        belegt_je_gottesdienst[slot.gottesdienst_id].discard(slot.mini_id)
    slot.mini_id = neuer_mini_id
    belegt_je_gottesdienst[slot.gottesdienst_id].add(neuer_mini_id)


def zuteilung_vorschlagen(
    db: Session, pfarrei_id: int, miniplan: Miniplan, zufallsstart: int | None = None
) -> dict[int, list[int]]:
    """Schlägt für jeden nicht manuell fixierten Platz eines Dienstbedarfs einen Mini vor.

    Manuell fixierte Zuweisungen (`manuell_fixiert=True`) werden dabei weder verändert noch
    zurückgeliefert, fließen aber in die Fairness-/Belegungs-Berechnung ein. Harte Constraints
    (Gruppen-Mindestanzahl, erforderliche Filtertags, Verfügbarkeit laut
    `services/verfuegbarkeit.ist_blockiert`, keine Doppelbelegung eines Minis innerhalb eines
    Gottesdienstes) werden nie verletzt - bleibt dafür kein passender Mini übrig, bleibt die
    Stelle unbesetzt. Darüber hinaus optimiert eine simulierte Abkühlung (Swap-/Ersatz-Züge) auf
    Fairness (möglichst gleichmäßige Diensthäufigkeit) und Abstand (kein Mini an zu dicht
    aufeinanderfolgenden Terminen).

    Liefert `dienstbedarf_id -> [mini_id, ...]` nur für die neu zugeteilten (nicht fixierten)
    Plätze.
    """
    zufall = random.Random(zufallsstart)

    minis = db.query(Mini).filter(Mini.pfarrei_id == pfarrei_id).all()
    minis_by_id = {m.id: m for m in minis}
    filtertag_id_by_key = {
        f.key: f.id for f in db.query(Filtertag).filter(Filtertag.pfarrei_id == pfarrei_id).all()
    }

    blockiert_cache: dict[tuple[int, date, time], bool] = {}

    def _ist_mini_blockiert(mini: Mini, datum: date, zeit: time) -> bool:
        schluessel = (mini.id, datum, zeit)
        if schluessel not in blockiert_cache:
            blockiert_cache[schluessel] = any(
                ist_blockiert(db, pfarrei_id, filtertag_id_by_key[tag], datum, zeit)
                for tag in mini.filtertags
                if tag in filtertag_id_by_key
            )
        return blockiert_cache[schluessel]

    slots, belegt_je_gottesdienst = _baue_slots(miniplan, minis_by_id)

    config = ZuteilungConfig.aus_miniplan(miniplan)

    einsatz_anzahl: dict[int, int] = {m.id: 0 for m in minis}
    # Fixierte Zuweisungen zählen für Fairness und fließen als konstante Belegung in die
    # Mixing-/Wiederholungs-Wertung ein (sie werden vom Algorithmus nicht verschoben).
    fixierte_belegung: list[tuple[int, tuple[object, ...], int]] = []
    for gottesdienst in miniplan.gottesdienste:
        for bedarf in gottesdienst.dienstbedarf:
            signatur = (bedarf.dienst_typ_id, bedarf.name, gottesdienst.uhrzeit)
            for zuweisung in bedarf.zuweisungen:
                if zuweisung.manuell_fixiert and zuweisung.mini_id in einsatz_anzahl:
                    einsatz_anzahl[zuweisung.mini_id] += 1
                    fixierte_belegung.append((gottesdienst.id, signatur, zuweisung.mini_id))

    _greedy_konstruktion(slots, minis, einsatz_anzahl, belegt_je_gottesdienst, _ist_mini_blockiert, zufall)
    _simulated_annealing(
        slots,
        minis,
        minis_by_id,
        einsatz_anzahl,
        belegt_je_gottesdienst,
        _ist_mini_blockiert,
        zufall,
        config,
        fixierte_belegung,
    )

    ergebnis: dict[int, list[int]] = {}
    for slot in slots:
        if slot.mini_id is not None:
            ergebnis.setdefault(slot.dienstbedarf_id, []).append(slot.mini_id)
    return ergebnis
