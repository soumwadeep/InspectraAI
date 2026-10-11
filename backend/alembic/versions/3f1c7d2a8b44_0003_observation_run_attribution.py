"""0003 observation run attribution

Revision ID: 3f1c7d2a8b44
Revises: 2139004302f3
Create Date: 2026-10-11 06:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3f1c7d2a8b44'
down_revision: Union[str, None] = '2139004302f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('vision_observations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('agent_run_id', sa.String(length=36), nullable=True))
        # Named explicitly: an unnamed FK makes batch mode raise
        # "Constraint must have a name", so `alembic upgrade head` failed on SQLite.
        batch_op.create_foreign_key(
            'vision_observations_agent_run_id_fkey',
            'agent_runs',
            ['agent_run_id'],
            ['id'],
        )
        batch_op.create_index(
            'ix_vision_observations_agent_run_id',
            ['agent_run_id'],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table('vision_observations', schema=None) as batch_op:
        batch_op.drop_index('ix_vision_observations_agent_run_id')
        batch_op.drop_constraint('vision_observations_agent_run_id_fkey', type_='foreignkey')
        batch_op.drop_column('agent_run_id')
