"""Unit-Tests für die aus `_simulated_annealing` extrahierten, pure(n) Bausteine: Temperatur-Plan,
Akzeptanzkriterium sowie Swap-/Ersatz-Züge. Diese Tests brauchen bewusst keine DB (siehe
`test_zuteilung.py` für Tests des kompletten `zuteilung_vorschlagen`-Ablaufs gegen echte Modelle) -
sie konstruieren `Mini`/`_Slot` als reine Python-Objekte und rufen die Hilfsfunktionen direkt auf.
"""

import math
import random
from datetime import date, time

from app.models.mini import Mini
from app.services.zuteilung import (
    _abkuehlungsfaktor,
    _akzeptieren,
    _ersatz_anwenden,
    _ersatz_kandidaten,
    _Slot,
    _sollte_akzeptieren,
    _swap_anwenden,
    _swap_gueltig,
    _temperaturplan,
)


def _mini(id: int, gruppe_id: int = 1, filtertags: list[str] | None = None) -> Mini:
    return Mini(
        id=id, pfarrei_id=1, gruppe_id=gruppe_id, name=f"Mini {id}", filtertags=filtertags or []
    )


def _slot(
    dienstbedarf_id: int,
    gottesdienst_id: int,
    mini_id: int | None,
    erforderliche_filtertags: frozenset[str] = frozenset(),
    quota_gruppe_id: int | None = None,
    datum: date = date(2026, 7, 5),
    zeit: time = time(10, 0),
) -> _Slot:
    return _Slot(
        dienstbedarf_id=dienstbedarf_id,
        gottesdienst_id=gottesdienst_id,
        datum=datum,
        zeit=zeit,
        erforderliche_filtertags=erforderliche_filtertags,
        quota_gruppe_id=quota_gruppe_id,
        signatur=(None, "Kreuz", zeit),
        mini_id=mini_id,
    )


def _nie_blockiert(mini: Mini, datum: date, zeit: time) -> bool:
    return False


def _immer_blockiert(mini: Mini, datum: date, zeit: time) -> bool:
    return True


# --- Temperatur-Plan ---------------------------------------------------------------------------


def test_temperaturplan_liefert_monoton_fallende_folge() -> None:
    temperaturen = list(_temperaturplan(50, start_temperatur=4.0, ziel_temperatur=0.001))

    assert len(temperaturen) == 50
    assert all(a > b for a, b in zip(temperaturen, temperaturen[1:], strict=False))
    assert temperaturen[0] < 4.0
    assert math.isclose(temperaturen[-1], 0.001, rel_tol=1e-9)


def test_temperaturplan_ist_reine_funktion_der_iterationszahl() -> None:
    # Zweimaliges Erzeugen desselben Plans liefert identische Werte - kein versteckter Zustand.
    a = list(_temperaturplan(10, start_temperatur=2.0, ziel_temperatur=0.01))
    b = list(_temperaturplan(10, start_temperatur=2.0, ziel_temperatur=0.01))
    assert a == b


def test_abkuehlungsfaktor_erreicht_zieltemperatur_nach_allen_iterationen() -> None:
    iterationen = 100
    start, ziel = 4.0, 0.001
    faktor = _abkuehlungsfaktor(iterationen, start, ziel)

    endtemperatur = start * faktor**iterationen
    assert math.isclose(endtemperatur, ziel, rel_tol=1e-9)


# --- Akzeptanzkriterium -------------------------------------------------------------------------


def test_sollte_akzeptieren_akzeptiert_verbessernde_und_gleich_gute_zuege_immer() -> None:
    # delta <= 0 muss unabhängig von Temperatur/Zufallswert akzeptiert werden - auch bei
    # Temperatur 0 (die sonst worsening-Züge kategorisch ablehnt) und einem Zufallswert nahe 1.
    assert _sollte_akzeptieren(-5.0, temperatur=1.0, zufallswert=0.999) is True
    assert _sollte_akzeptieren(0.0, temperatur=0.0, zufallswert=0.999) is True


def test_sollte_akzeptieren_lehnt_verschlechternde_zuege_bei_temperatur_null_immer_ab() -> None:
    assert _sollte_akzeptieren(0.5, temperatur=0.0, zufallswert=0.0) is False


def test_sollte_akzeptieren_prueft_zufallswert_gegen_boltzmann_schwelle() -> None:
    delta, temperatur = 1.0, 2.0
    schwelle = math.exp(-delta / temperatur)

    # knapp unterhalb der Schwelle: akzeptieren
    assert _sollte_akzeptieren(delta, temperatur, zufallswert=schwelle - 1e-9) is True
    # knapp oberhalb (bzw. exakt) der Schwelle: ablehnen
    assert _sollte_akzeptieren(delta, temperatur, zufallswert=schwelle) is False
    assert _sollte_akzeptieren(delta, temperatur, zufallswert=schwelle + 1e-9) is False


def test_sollte_akzeptieren_groessere_verschlechterung_hat_niedrigere_schwelle() -> None:
    temperatur = 1.0
    kleine_schwelle = math.exp(-1.0 / temperatur)
    grosse_schwelle = math.exp(-5.0 / temperatur)
    assert grosse_schwelle < kleine_schwelle


def test_akzeptieren_zieht_delta_aus_alter_und_neuer_badness() -> None:
    # `_akzeptieren` reicht (neue - alte Badness) sowie einen aus `zufall` gezogenen Wert an
    # `_sollte_akzeptieren` durch - mit `random.Random(seed).random()` deterministisch
    # nachvollziehbar.
    zufall = random.Random(1234)
    erwarteter_zufallswert = random.Random(1234).random()

    ergebnis = _akzeptieren(alte_badness=10.0, neue_badness=12.0, temperatur=1.0, zufall=zufall)

    assert ergebnis == _sollte_akzeptieren(
        delta_badness=2.0, temperatur=1.0, zufallswert=erwarteter_zufallswert
    )


def test_akzeptieren_akzeptiert_verbessernden_zug_unabhaengig_vom_zufallswert() -> None:
    zufall = random.Random(0)
    assert _akzeptieren(alte_badness=10.0, neue_badness=5.0, temperatur=1.0, zufall=zufall) is True


# --- Swap-Zug ------------------------------------------------------------------------------------


def test_swap_gueltig_lehnt_tausch_innerhalb_desselben_gottesdienstes_ab() -> None:
    mini_a, mini_b = _mini(1), _mini(2)
    a = _slot(dienstbedarf_id=1, gottesdienst_id=10, mini_id=mini_a.id)
    b = _slot(dienstbedarf_id=2, gottesdienst_id=10, mini_id=mini_b.id)
    minis_by_id = {mini_a.id: mini_a, mini_b.id: mini_b}
    belegt = {10: {mini_a.id, mini_b.id}}

    assert _swap_gueltig(a, b, minis_by_id, belegt, _nie_blockiert) is False


def test_swap_gueltig_prueft_erforderliche_filtertags_beider_seiten() -> None:
    mini_a = _mini(1, filtertags=["schueler"])
    mini_b = _mini(2, filtertags=[])
    a = _slot(
        dienstbedarf_id=1,
        gottesdienst_id=10,
        mini_id=mini_a.id,
        erforderliche_filtertags=frozenset({"schueler"}),
    )
    b = _slot(dienstbedarf_id=2, gottesdienst_id=20, mini_id=mini_b.id)
    minis_by_id = {mini_a.id: mini_a, mini_b.id: mini_b}
    belegt = {10: {mini_a.id}, 20: {mini_b.id}}

    # mini_b hat "schueler" nicht -> darf nicht auf Slot a rutschen.
    assert _swap_gueltig(a, b, minis_by_id, belegt, _nie_blockiert) is False


def test_swap_gueltig_erlaubt_passenden_tausch_ueber_gottesdienste_hinweg() -> None:
    mini_a, mini_b = _mini(1), _mini(2)
    a = _slot(dienstbedarf_id=1, gottesdienst_id=10, mini_id=mini_a.id)
    b = _slot(dienstbedarf_id=2, gottesdienst_id=20, mini_id=mini_b.id)
    minis_by_id = {mini_a.id: mini_a, mini_b.id: mini_b}
    belegt = {10: {mini_a.id}, 20: {mini_b.id}}

    assert _swap_gueltig(a, b, minis_by_id, belegt, _nie_blockiert) is True


def test_swap_gueltig_prueft_verfuegbarkeit_beider_seiten() -> None:
    mini_a, mini_b = _mini(1), _mini(2)
    a = _slot(dienstbedarf_id=1, gottesdienst_id=10, mini_id=mini_a.id)
    b = _slot(dienstbedarf_id=2, gottesdienst_id=20, mini_id=mini_b.id)
    minis_by_id = {mini_a.id: mini_a, mini_b.id: mini_b}
    belegt = {10: {mini_a.id}, 20: {mini_b.id}}

    assert _swap_gueltig(a, b, minis_by_id, belegt, _immer_blockiert) is False


def test_swap_anwenden_tauscht_minis_und_belegungssets() -> None:
    mini_a, mini_b = _mini(1), _mini(2)
    a = _slot(dienstbedarf_id=1, gottesdienst_id=10, mini_id=mini_a.id)
    b = _slot(dienstbedarf_id=2, gottesdienst_id=20, mini_id=mini_b.id)
    belegt = {10: {mini_a.id}, 20: {mini_b.id}}

    alte_a, alte_b = _swap_anwenden(a, b, belegt)

    assert (alte_a, alte_b) == (mini_a.id, mini_b.id)
    assert a.mini_id == mini_b.id
    assert b.mini_id == mini_a.id
    assert belegt == {10: {mini_b.id}, 20: {mini_a.id}}


def test_swap_anwenden_ist_involution_zweimaliges_anwenden_stellt_original_wieder_her() -> None:
    mini_a, mini_b = _mini(1), _mini(2)
    a = _slot(dienstbedarf_id=1, gottesdienst_id=10, mini_id=mini_a.id)
    b = _slot(dienstbedarf_id=2, gottesdienst_id=20, mini_id=mini_b.id)
    belegt = {10: {mini_a.id}, 20: {mini_b.id}}

    _swap_anwenden(a, b, belegt)
    _swap_anwenden(a, b, belegt)

    assert a.mini_id == mini_a.id
    assert b.mini_id == mini_b.id
    assert belegt == {10: {mini_a.id}, 20: {mini_b.id}}


# --- Ersatz-Zug ----------------------------------------------------------------------------------


def test_ersatz_kandidaten_schliesst_aktuell_zugewiesenen_mini_aus() -> None:
    mini_a, mini_b = _mini(1), _mini(2)
    slot = _slot(dienstbedarf_id=1, gottesdienst_id=10, mini_id=mini_a.id)
    belegt = {10: {mini_a.id}}
    einsatz_anzahl = {mini_a.id: 1, mini_b.id: 0}
    max_pro_mini = {mini_a.id: None, mini_b.id: None}

    kandidaten = _ersatz_kandidaten(
        slot, [mini_a, mini_b], belegt, einsatz_anzahl, max_pro_mini, _nie_blockiert
    )

    assert kandidaten == [mini_b]


def test_ersatz_kandidaten_schliesst_blockierte_und_ausgeschoepfte_minis_aus() -> None:
    mini_a, mini_b, mini_c = _mini(1), _mini(2), _mini(3)
    slot = _slot(dienstbedarf_id=1, gottesdienst_id=10, mini_id=mini_a.id)
    belegt = {10: {mini_a.id}}
    # mini_b ist am Limit, mini_c ist blockiert -> keiner von beiden darf einspringen.
    einsatz_anzahl = {mini_a.id: 1, mini_b.id: 2, mini_c.id: 0}
    max_pro_mini = {mini_a.id: None, mini_b.id: 2, mini_c.id: None}

    def _blockiert_nur_c(mini: Mini, datum: date, zeit: time) -> bool:
        return mini.id == mini_c.id

    kandidaten = _ersatz_kandidaten(
        slot, [mini_a, mini_b, mini_c], belegt, einsatz_anzahl, max_pro_mini, _blockiert_nur_c
    )

    assert kandidaten == []


def test_ersatz_anwenden_aktualisiert_einsatz_anzahl_und_slot() -> None:
    mini_a, mini_b = _mini(1), _mini(2)
    slot = _slot(dienstbedarf_id=1, gottesdienst_id=10, mini_id=mini_a.id)
    belegt = {10: {mini_a.id}}
    einsatz_anzahl = {mini_a.id: 3, mini_b.id: 1}

    alter_mini_id = _ersatz_anwenden(slot, mini_b.id, einsatz_anzahl, belegt)

    assert alter_mini_id == mini_a.id
    assert slot.mini_id == mini_b.id
    assert belegt == {10: {mini_b.id}}
    assert einsatz_anzahl == {mini_a.id: 2, mini_b.id: 2}


def test_ersatz_anwenden_ist_umkehrbar_mit_alter_mini_id() -> None:
    mini_a, mini_b = _mini(1), _mini(2)
    slot = _slot(dienstbedarf_id=1, gottesdienst_id=10, mini_id=mini_a.id)
    belegt = {10: {mini_a.id}}
    einsatz_anzahl = {mini_a.id: 3, mini_b.id: 1}

    alter_mini_id = _ersatz_anwenden(slot, mini_b.id, einsatz_anzahl, belegt)
    _ersatz_anwenden(slot, alter_mini_id, einsatz_anzahl, belegt)

    assert slot.mini_id == mini_a.id
    assert belegt == {10: {mini_a.id}}
    assert einsatz_anzahl == {mini_a.id: 3, mini_b.id: 1}
