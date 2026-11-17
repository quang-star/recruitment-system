"""Archive owned identity mappings; pause here to import Auth/Core mappings."""
from alembic import op
from migrations.business_identity import prepare

revision = '0019'
down_revision = '0018'
branch_labels = None
depends_on = None


def upgrade():
    prepare(op.get_bind())


def downgrade():
    raise RuntimeError('Restore the offline backup to reverse the identity upgrade')
