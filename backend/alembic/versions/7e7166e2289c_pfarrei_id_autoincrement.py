"""pfarrei id autoincrement

Revision ID: 7e7166e2289c
Revises: f520a2df503d
Create Date: 2026-07-13 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "7e7166e2289c"
down_revision: str | None = "f520a2df503d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Erzwingt AUTOINCREMENT auf pfarreien.id, damit SQLite gelöschte IDs nicht wiederverwendet
    # (siehe app/models/pfarrei.py).
    with op.batch_alter_table(
        "pfarreien", recreate="always", table_kwargs={"sqlite_autoincrement": True}
    ):
        pass


def downgrade() -> None:
    with op.batch_alter_table("pfarreien", recreate="always"):
        pass
