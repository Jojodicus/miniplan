"""gottesdienst name optional

Revision ID: fb23ac9c6d2d
Revises: bf1df9e7930a
Create Date: 2026-07-07 00:25:38.124451

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "fb23ac9c6d2d"
down_revision: str | None = "bf1df9e7930a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("gottesdienste") as batch_op:
        batch_op.alter_column("name", existing_type=sa.VARCHAR(length=255), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("gottesdienste") as batch_op:
        batch_op.alter_column("name", existing_type=sa.VARCHAR(length=255), nullable=False)
