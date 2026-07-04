"""filtertags pro pfarrei

Ersetzt den bisher hart codierten `Filtertag`-Enum durch eine pro Pfarrei frei konfigurierbare
Tabelle `filtertags` (key, label, ist_schueler_artig). `filtertag_blocker.filtertag` (bisher ein
DB-Enum) wird auf eine FK `filtertag_id` auf diese neue Tabelle umgestellt.

Da diese Migration gegen echte Daten läuft, werden beim Hochfahren für jede bestehende Pfarrei
die drei bisherigen Enum-Werte als Filtertag-Zeilen angelegt (mit denselben Keys wie zuvor, damit
die in `minis.filtertags` / `dienst_typen.erforderliche_filtertags` / `dienstbedarf.erforderliche_
filtertags` als JSON gespeicherten Keys weiterhin gültig bleiben) und alle bestehenden
`filtertag_blocker`-Zeilen auf die passende neue Zeile verknüpft.

Revision ID: 5c13f29a84b9
Revises: 6f7471145215
Create Date: 2026-07-04 23:04:54.135193

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5c13f29a84b9'
down_revision: Union[str, None] = '6f7471145215'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_DEFAULT_FILTERTAGS = [
    ("grundschueler", "Grundschüler", True),
    ("schueler", "Schüler", True),
    ("arbeiter", "Arbeiter", False),
]


def upgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        "filtertags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pfarrei_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("ist_schueler_artig", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["pfarrei_id"], ["pfarreien.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pfarrei_id", "key", name="uq_filtertag_pfarrei_key"),
    )

    filtertags_tabelle = sa.table(
        "filtertags",
        sa.column("id", sa.Integer),
        sa.column("pfarrei_id", sa.Integer),
        sa.column("key", sa.String),
        sa.column("label", sa.String),
        sa.column("ist_schueler_artig", sa.Boolean),
    )
    pfarreien_tabelle = sa.table("pfarreien", sa.column("id", sa.Integer))

    # Für jede bestehende Pfarrei die drei bisherigen Enum-Werte als Filtertag-Zeilen anlegen,
    # damit Minis/DienstTypen/Dienstbedarf mit diesen Keys weiterhin gültig referenziert werden.
    pfarrei_ids = [row[0] for row in bind.execute(sa.select(pfarreien_tabelle.c.id))]
    key_zu_filtertag_id: dict[tuple[int, str], int] = {}
    for pfarrei_id in pfarrei_ids:
        for key, label, ist_schueler_artig in _DEFAULT_FILTERTAGS:
            bind.execute(
                filtertags_tabelle.insert().values(
                    pfarrei_id=pfarrei_id,
                    key=key,
                    label=label,
                    ist_schueler_artig=ist_schueler_artig,
                )
            )
            neue_id = bind.execute(
                sa.select(filtertags_tabelle.c.id).where(
                    filtertags_tabelle.c.pfarrei_id == pfarrei_id,
                    filtertags_tabelle.c.key == key,
                )
            ).scalar_one()
            key_zu_filtertag_id[(pfarrei_id, key)] = neue_id

    op.add_column("filtertag_blocker", sa.Column("filtertag_id", sa.Integer(), nullable=True))

    filtertag_blocker_tabelle = sa.table(
        "filtertag_blocker",
        sa.column("id", sa.Integer),
        sa.column("pfarrei_id", sa.Integer),
        sa.column("filtertag", sa.String),
        sa.column("filtertag_id", sa.Integer),
    )
    # `filtertag_blocker.filtertag` war ein `Enum(Filtertag)`; SQLAlchemy legt Enum-Spalten per
    # Default anhand des Member-*Namens* an (Großbuchstaben), nicht des `.value` - daher hier auf
    # die entsprechenden Keys zurückmappen.
    _ENUM_NAME_ZU_KEY = {
        "GRUNDSCHUELER": "grundschueler",
        "SCHUELER": "schueler",
        "ARBEITER": "arbeiter",
    }
    for row in bind.execute(
        sa.select(
            filtertag_blocker_tabelle.c.id,
            filtertag_blocker_tabelle.c.pfarrei_id,
            filtertag_blocker_tabelle.c.filtertag,
        )
    ):
        key = _ENUM_NAME_ZU_KEY[row.filtertag]
        filtertag_id = key_zu_filtertag_id[(row.pfarrei_id, key)]
        bind.execute(
            filtertag_blocker_tabelle.update()
            .where(filtertag_blocker_tabelle.c.id == row.id)
            .values(filtertag_id=filtertag_id)
        )

    with op.batch_alter_table("filtertag_blocker") as batch_op:
        batch_op.alter_column("filtertag_id", nullable=False)
        batch_op.drop_column("filtertag")
        batch_op.create_foreign_key(
            "fk_filtertag_blocker_filtertag_id", "filtertags", ["filtertag_id"], ["id"]
        )


def downgrade() -> None:
    bind = op.get_bind()

    op.add_column(
        "filtertag_blocker",
        sa.Column(
            "filtertag",
            sa.Enum("GRUNDSCHUELER", "SCHUELER", "ARBEITER", name="filtertag"),
            nullable=True,
        ),
    )

    filtertag_blocker_tabelle = sa.table(
        "filtertag_blocker",
        sa.column("id", sa.Integer),
        sa.column("filtertag_id", sa.Integer),
        sa.column("filtertag", sa.String),
    )
    filtertags_tabelle = sa.table(
        "filtertags",
        sa.column("id", sa.Integer),
        sa.column("key", sa.String),
    )
    _ENUM_WERT = {
        "grundschueler": "GRUNDSCHUELER",
        "schueler": "SCHUELER",
        "arbeiter": "ARBEITER",
    }
    for row in bind.execute(
        sa.select(filtertag_blocker_tabelle.c.id, filtertag_blocker_tabelle.c.filtertag_id)
    ):
        filtertag_key = bind.execute(
            sa.select(filtertags_tabelle.c.key).where(filtertags_tabelle.c.id == row.filtertag_id)
        ).scalar_one()
        bind.execute(
            filtertag_blocker_tabelle.update()
            .where(filtertag_blocker_tabelle.c.id == row.id)
            .values(filtertag=_ENUM_WERT[filtertag_key])
        )

    with op.batch_alter_table("filtertag_blocker") as batch_op:
        batch_op.alter_column("filtertag", nullable=False)
        batch_op.drop_column("filtertag_id")

    op.drop_table("filtertags")
