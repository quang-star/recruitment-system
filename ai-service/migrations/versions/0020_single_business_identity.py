"""Convert references transactionally using staged, service-owned mappings."""
from alembic import op
from migrations.business_identity import convert

revision = '0020'
down_revision = '0019'
branch_labels = None
depends_on = None


def upgrade():
    convert(op.get_bind())


def downgrade():
    raise RuntimeError('Restore the offline backup to reverse the identity upgrade')
