"""gottesdienst name optional

Revision ID: fb23ac9c6d2d
Revises: bf1df9e7930a
Create Date: 2026-07-07 00:25:38.124451

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'fb23ac9c6d2d'
down_revision: Union[str, None] = 'bf1df9e7930a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('gottesdienste') as batch_op:
        batch_op.alter_column('name', existing_type=sa.VARCHAR(length=255), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('gottesdienste') as batch_op:
        batch_op.alter_column('name', existing_type=sa.VARCHAR(length=255), nullable=False)
