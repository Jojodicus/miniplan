"""Gemeinsame Router-Helfer. Ersetzt die früher pro `api/*.py`-Modul duplizierten
`_get_<Modell>_or_404`-Funktionen (Query per ID, optional gefiltert auf `pfarrei_id`, 404 falls
nichts gefunden) durch einen einzigen generischen Helfer."""

from collections.abc import Sequence
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement
from sqlalchemy.orm import Session


def get_or_404[ModelT](
    db: Session,
    model: type[ModelT],
    id_: Any,
    *,
    pfarrei_id: int | None = None,
    filters: Sequence[ColumnElement[bool]] = (),
    joins: Sequence[tuple[Any, ColumnElement[bool]]] = (),
    options: Sequence[Any] = (),
    not_found_detail: str | None = None,
) -> ModelT:
    """Lädt `model` per Primärschlüssel `id_`; wirft 404, wenn nichts gefunden wird oder (bei
    gesetztem `pfarrei_id`) der Datensatz zu einer anderen Pfarrei gehört.

    - `pfarrei_id` deckt den weitaus häufigsten Fall ab (Modell hat eine eigene
      `pfarrei_id`-Spalte).
    - `filters`/`joins` decken die übrigen Fälle ab, in denen stattdessen über eine andere Spalte
      bzw. einen Join gescoped wird (z.B. `Gottesdienst` über `miniplan_id`, `DienstbedarfZuweisung`
      transitiv über `Dienstbedarf`/`Gottesdienst` bis zum `Miniplan`).
    - `options` reicht SQLAlchemy-Ladeoptionen durch (z.B. `selectinload`-Ketten), damit bestehende
      Eager-Loading-Aufrufe (siehe `api.miniplaene._planstand_optionen`) unverändert erhalten
      bleiben - ohne sie würde eine solche Stelle sonst stillschweigend auf Lazy-Loads (N+1)
      zurückfallen.
    """
    query = db.query(model)
    for ziel, bedingung in joins:
        query = query.join(ziel, bedingung)
    if options:
        query = query.options(*options)
    bedingungen: list[ColumnElement[bool]] = [model.id == id_, *filters]
    if pfarrei_id is not None:
        bedingungen.append(model.pfarrei_id == pfarrei_id)
    objekt = query.filter(*bedingungen).first()
    if objekt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=not_found_detail or f"{model.__name__} nicht gefunden",
        )
    return objekt
