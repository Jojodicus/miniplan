from sqlalchemy.orm import Session

from app.models.filtertag import Filtertag


def unbekannte_filtertag_keys(pfarrei_id: int, keys: set[str], db: Session) -> set[str]:
    """Liefert die Teilmenge von `keys`, die keinem Filtertag dieser Pfarrei entspricht."""
    if not keys:
        return set()
    gueltige = {
        row[0] for row in db.query(Filtertag.key).filter(Filtertag.pfarrei_id == pfarrei_id).all()
    }
    return keys - gueltige
