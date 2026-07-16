"""einladungen

Revision ID: dd2114fedca4
Revises: 79f9de967fe3
Create Date: 2026-07-16 23:54:13.147327

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "dd2114fedca4"
down_revision: str | None = "79f9de967fe3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "einladungen",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("pfarrei_id", sa.Integer(), nullable=False),
        sa.Column(
            "rolle",
            sa.Enum("PFARREI_VERANTWORTLICHER", "BETRACHTER", name="pfarreirolle"),
            nullable=False,
        ),
        sa.Column("erstellt_von_id", sa.Integer(), nullable=False),
        sa.Column("erstellt_am", sa.DateTime(timezone=True), nullable=False),
        sa.Column("laeuft_ab_am", sa.DateTime(timezone=True), nullable=False),
        sa.Column("eingeloest_am", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["erstellt_von_id"], ["nutzer.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pfarrei_id"], ["pfarreien.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_einladungen_token"), "einladungen", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_einladungen_token"), table_name="einladungen")
    op.drop_table("einladungen")
