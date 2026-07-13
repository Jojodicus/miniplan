"""on delete cascade fuer pfarrei-scoped tabellen

Revision ID: b01bc2026715
Revises: 7e7166e2289c
Create Date: 2026-07-13 00:10:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "b01bc2026715"
down_revision: str | None = "7e7166e2289c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# SQLite vergibt reflektierten Foreign-Keys keine stabilen Namen; diese Konvention lässt Alembic
# beim Batch-Rebuild dieselben, deterministisch benannten Constraints droppen und neu anlegen.
_NAMING_CONVENTION = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}


def _fk_name(table: str, column: str, referred_table: str) -> str:
    return f"fk_{table}_{column}_{referred_table}"


def upgrade() -> None:
    # Ohne DB-seitiges ON DELETE CASCADE bleiben beim Löschen einer Pfarrei (oder anderer
    # Eltern-Zeilen) verwaiste Kind-Zeilen zurück, die insbesondere bei SQLite-ID-Wiederverwendung
    # zu Unique-Constraint-Konflikten führen können (siehe api/admin.py pfarrei_loeschen).
    with op.batch_alter_table(
        "nutzer_pfarrei_rollen", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("nutzer_pfarrei_rollen", "nutzer_id", "nutzer"), type_="foreignkey"
        )
        batch_op.drop_constraint(
            _fk_name("nutzer_pfarrei_rollen", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("nutzer_pfarrei_rollen", "nutzer_id", "nutzer"),
            "nutzer",
            ["nutzer_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_foreign_key(
            _fk_name("nutzer_pfarrei_rollen", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "gruppen", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(_fk_name("gruppen", "pfarrei_id", "pfarreien"), type_="foreignkey")
        batch_op.create_foreign_key(
            _fk_name("gruppen", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "minis", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(_fk_name("minis", "pfarrei_id", "pfarreien"), type_="foreignkey")
        batch_op.create_foreign_key(
            _fk_name("minis", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
            ondelete="CASCADE",
        )
        # gruppe_id bleibt ohne ondelete: Gruppe.loeschen blockiert (409) solange Minis existieren.

    with op.batch_alter_table(
        "dienst_typen", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("dienst_typen", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("dienst_typen", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "dienst_typ_gruppen_anforderungen",
        naming_convention=_NAMING_CONVENTION,
        recreate="always",
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("dienst_typ_gruppen_anforderungen", "dienst_typ_id", "dienst_typen"),
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            _fk_name("dienst_typ_gruppen_anforderungen", "gruppe_id", "gruppen"),
            type_="foreignkey",
        )
        batch_op.create_foreign_key(
            _fk_name("dienst_typ_gruppen_anforderungen", "dienst_typ_id", "dienst_typen"),
            "dienst_typen",
            ["dienst_typ_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_foreign_key(
            _fk_name("dienst_typ_gruppen_anforderungen", "gruppe_id", "gruppen"),
            "gruppen",
            ["gruppe_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "filtertags", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("filtertags", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("filtertags", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "filtertag_blocker", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("filtertag_blocker", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        # abweichender Name aus der ursprünglichen Migration (5c13f29a84b9), folgt nicht der
        # obigen Namenskonvention.
        batch_op.drop_constraint("fk_filtertag_blocker_filtertag_id", type_="foreignkey")
        batch_op.create_foreign_key(
            _fk_name("filtertag_blocker", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_foreign_key(
            _fk_name("filtertag_blocker", "filtertag_id", "filtertags"),
            "filtertags",
            ["filtertag_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "ferienzeitraeume", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("ferienzeitraeume", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("ferienzeitraeume", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "feiertag_einstellungen", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("feiertag_einstellungen", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("feiertag_einstellungen", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "miniplaene", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("miniplaene", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("miniplaene", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "gottesdienste", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("gottesdienste", "miniplan_id", "miniplaene"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("gottesdienste", "miniplan_id", "miniplaene"),
            "miniplaene",
            ["miniplan_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "dienstbedarf", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("dienstbedarf", "gottesdienst_id", "gottesdienste"), type_="foreignkey"
        )
        batch_op.drop_constraint(
            _fk_name("dienstbedarf", "dienst_typ_id", "dienst_typen"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("dienstbedarf", "gottesdienst_id", "gottesdienste"),
            "gottesdienste",
            ["gottesdienst_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_foreign_key(
            _fk_name("dienstbedarf", "dienst_typ_id", "dienst_typen"),
            "dienst_typen",
            ["dienst_typ_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table(
        "dienstbedarf_gruppen_anforderungen",
        naming_convention=_NAMING_CONVENTION,
        recreate="always",
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("dienstbedarf_gruppen_anforderungen", "dienstbedarf_id", "dienstbedarf"),
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            _fk_name("dienstbedarf_gruppen_anforderungen", "gruppe_id", "gruppen"),
            type_="foreignkey",
        )
        batch_op.create_foreign_key(
            _fk_name("dienstbedarf_gruppen_anforderungen", "dienstbedarf_id", "dienstbedarf"),
            "dienstbedarf",
            ["dienstbedarf_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_foreign_key(
            _fk_name("dienstbedarf_gruppen_anforderungen", "gruppe_id", "gruppen"),
            "gruppen",
            ["gruppe_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "dienstbedarf_zuweisungen", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("dienstbedarf_zuweisungen", "dienstbedarf_id", "dienstbedarf"),
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            _fk_name("dienstbedarf_zuweisungen", "mini_id", "minis"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("dienstbedarf_zuweisungen", "dienstbedarf_id", "dienstbedarf"),
            "dienstbedarf",
            ["dienstbedarf_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_foreign_key(
            _fk_name("dienstbedarf_zuweisungen", "mini_id", "minis"),
            "minis",
            ["mini_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    with op.batch_alter_table(
        "dienstbedarf_zuweisungen", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("dienstbedarf_zuweisungen", "dienstbedarf_id", "dienstbedarf"),
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            _fk_name("dienstbedarf_zuweisungen", "mini_id", "minis"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("dienstbedarf_zuweisungen", "dienstbedarf_id", "dienstbedarf"),
            "dienstbedarf",
            ["dienstbedarf_id"],
            ["id"],
        )
        batch_op.create_foreign_key(
            _fk_name("dienstbedarf_zuweisungen", "mini_id", "minis"), "minis", ["mini_id"], ["id"]
        )

    with op.batch_alter_table(
        "dienstbedarf_gruppen_anforderungen",
        naming_convention=_NAMING_CONVENTION,
        recreate="always",
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("dienstbedarf_gruppen_anforderungen", "dienstbedarf_id", "dienstbedarf"),
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            _fk_name("dienstbedarf_gruppen_anforderungen", "gruppe_id", "gruppen"),
            type_="foreignkey",
        )
        batch_op.create_foreign_key(
            _fk_name("dienstbedarf_gruppen_anforderungen", "dienstbedarf_id", "dienstbedarf"),
            "dienstbedarf",
            ["dienstbedarf_id"],
            ["id"],
        )
        batch_op.create_foreign_key(
            _fk_name("dienstbedarf_gruppen_anforderungen", "gruppe_id", "gruppen"),
            "gruppen",
            ["gruppe_id"],
            ["id"],
        )

    with op.batch_alter_table(
        "dienstbedarf", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("dienstbedarf", "gottesdienst_id", "gottesdienste"), type_="foreignkey"
        )
        batch_op.drop_constraint(
            _fk_name("dienstbedarf", "dienst_typ_id", "dienst_typen"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("dienstbedarf", "gottesdienst_id", "gottesdienste"),
            "gottesdienste",
            ["gottesdienst_id"],
            ["id"],
        )
        batch_op.create_foreign_key(
            _fk_name("dienstbedarf", "dienst_typ_id", "dienst_typen"),
            "dienst_typen",
            ["dienst_typ_id"],
            ["id"],
        )

    with op.batch_alter_table(
        "gottesdienste", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("gottesdienste", "miniplan_id", "miniplaene"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("gottesdienste", "miniplan_id", "miniplaene"),
            "miniplaene",
            ["miniplan_id"],
            ["id"],
        )

    with op.batch_alter_table(
        "miniplaene", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("miniplaene", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("miniplaene", "pfarrei_id", "pfarreien"), "pfarreien", ["pfarrei_id"], ["id"]
        )

    with op.batch_alter_table(
        "feiertag_einstellungen", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("feiertag_einstellungen", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("feiertag_einstellungen", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
        )

    with op.batch_alter_table(
        "ferienzeitraeume", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("ferienzeitraeume", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("ferienzeitraeume", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
        )

    with op.batch_alter_table(
        "filtertag_blocker", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("filtertag_blocker", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.drop_constraint(
            _fk_name("filtertag_blocker", "filtertag_id", "filtertags"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("filtertag_blocker", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
        )
        # Original-Name aus 5c13f29a84b9 wiederherstellen
        batch_op.create_foreign_key(
            "fk_filtertag_blocker_filtertag_id", "filtertags", ["filtertag_id"], ["id"]
        )

    with op.batch_alter_table(
        "filtertags", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("filtertags", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("filtertags", "pfarrei_id", "pfarreien"), "pfarreien", ["pfarrei_id"], ["id"]
        )

    with op.batch_alter_table(
        "dienst_typ_gruppen_anforderungen",
        naming_convention=_NAMING_CONVENTION,
        recreate="always",
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("dienst_typ_gruppen_anforderungen", "dienst_typ_id", "dienst_typen"),
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            _fk_name("dienst_typ_gruppen_anforderungen", "gruppe_id", "gruppen"),
            type_="foreignkey",
        )
        batch_op.create_foreign_key(
            _fk_name("dienst_typ_gruppen_anforderungen", "dienst_typ_id", "dienst_typen"),
            "dienst_typen",
            ["dienst_typ_id"],
            ["id"],
        )
        batch_op.create_foreign_key(
            _fk_name("dienst_typ_gruppen_anforderungen", "gruppe_id", "gruppen"),
            "gruppen",
            ["gruppe_id"],
            ["id"],
        )

    with op.batch_alter_table(
        "dienst_typen", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("dienst_typen", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("dienst_typen", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
        )

    with op.batch_alter_table(
        "minis", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(_fk_name("minis", "pfarrei_id", "pfarreien"), type_="foreignkey")
        batch_op.create_foreign_key(
            _fk_name("minis", "pfarrei_id", "pfarreien"), "pfarreien", ["pfarrei_id"], ["id"]
        )

    with op.batch_alter_table(
        "gruppen", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(_fk_name("gruppen", "pfarrei_id", "pfarreien"), type_="foreignkey")
        batch_op.create_foreign_key(
            _fk_name("gruppen", "pfarrei_id", "pfarreien"), "pfarreien", ["pfarrei_id"], ["id"]
        )

    with op.batch_alter_table(
        "nutzer_pfarrei_rollen", naming_convention=_NAMING_CONVENTION, recreate="always"
    ) as batch_op:
        batch_op.drop_constraint(
            _fk_name("nutzer_pfarrei_rollen", "nutzer_id", "nutzer"), type_="foreignkey"
        )
        batch_op.drop_constraint(
            _fk_name("nutzer_pfarrei_rollen", "pfarrei_id", "pfarreien"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            _fk_name("nutzer_pfarrei_rollen", "nutzer_id", "nutzer"),
            "nutzer",
            ["nutzer_id"],
            ["id"],
        )
        batch_op.create_foreign_key(
            _fk_name("nutzer_pfarrei_rollen", "pfarrei_id", "pfarreien"),
            "pfarreien",
            ["pfarrei_id"],
            ["id"],
        )
