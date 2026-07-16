from sqlalchemy.orm import Session

from app.models.filtertag import Filtertag
from app.models.pfarrei import Pfarrei
from app.services.filtertag_validation import unbekannte_filtertag_keys


def test_leere_keys_liefert_leeres_ergebnis_ohne_db_zugriff(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    # Kein Filtertag angelegt - würde die Query trotzdem ausgeführt, gäbe es auch dafür kein
    # Ergebnis. Der Kurzschluss bei leeren `keys` ist trotzdem beobachtbar: er funktioniert auch
    # ohne jede Filtertag-Zeile in der DB.
    assert unbekannte_filtertag_keys(pfarrei.id, set(), db_session) == set()


def test_alle_keys_bekannt_liefert_leere_menge(
    db_session: Session, pfarrei: Pfarrei, filtertags: dict[str, Filtertag]
) -> None:
    assert unbekannte_filtertag_keys(pfarrei.id, {"schueler", "arbeiter"}, db_session) == set()


def test_unbekannter_key_wird_erkannt(
    db_session: Session, pfarrei: Pfarrei, filtertags: dict[str, Filtertag]
) -> None:
    unbekannt = unbekannte_filtertag_keys(pfarrei.id, {"schueler", "nicht_existent"}, db_session)
    assert unbekannt == {"nicht_existent"}


def test_gemischt_bekannte_und_unbekannte_keys(
    db_session: Session, pfarrei: Pfarrei, filtertags: dict[str, Filtertag]
) -> None:
    unbekannt = unbekannte_filtertag_keys(
        pfarrei.id, {"grundschueler", "schueler", "arbeiter", "fremd1", "fremd2"}, db_session
    )
    assert unbekannt == {"fremd1", "fremd2"}


def test_key_einer_anderen_pfarrei_gilt_als_unbekannt(
    db_session: Session, pfarrei: Pfarrei, filtertags: dict[str, Filtertag]
) -> None:
    """Ein Filtertag-Key, der zwar existiert, aber einer anderen Pfarrei gehört, darf nicht als
    gültig durchgehen - sonst könnte ein Mini/Dienstbedarf einer Pfarrei mit dem Filtertag-Key
    einer fremden Pfarrei verknüpft werden."""
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)

    fremder_filtertag = Filtertag(
        pfarrei_id=andere_pfarrei.id, key="exklusiv", label="Exklusiv", ist_schueler_artig=False
    )
    db_session.add(fremder_filtertag)
    db_session.commit()

    unbekannt = unbekannte_filtertag_keys(pfarrei.id, {"schueler", "exklusiv"}, db_session)
    assert unbekannt == {"exklusiv"}


def test_ohne_jeden_filtertag_der_pfarrei_sind_alle_keys_unbekannt(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    # Keine `filtertags`-Fixture verwendet: die Pfarrei hat keine Filtertags angelegt.
    unbekannt = unbekannte_filtertag_keys(pfarrei.id, {"schueler"}, db_session)
    assert unbekannt == {"schueler"}
