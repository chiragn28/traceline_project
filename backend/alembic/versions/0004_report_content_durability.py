"""Store report content in the database, not on the local filesystem.

Report rows were durable but the CSV bytes they pointed at were written to
a local directory (default /tmp/traceline_reports). On any host with an
ephemeral filesystem -- Railway, Fly, Heroku, a restarted container -- a
redeploy deleted the file while the row survived, so every previously
generated report failed its integrity check and returned a 500 on download.
For a product whose entire output is audit evidence, the evidence was the
one artifact that didn't persist.

`content` is nullable because rows created before this migration have no
recoverable bytes; the download endpoint reports those as permanently
unavailable (410) rather than pretending it's a transient server error.
`file_path` becomes nullable for the same reason -- new rows don't set it.

Revision ID: 0004
Revises: 0003
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("report", sa.Column("content", sa.Text(), nullable=True))
    op.alter_column("report", "file_path", existing_type=sa.String(1000), nullable=True)


def downgrade() -> None:
    # Rows created after the upgrade have no file_path, so it cannot be made
    # NOT NULL again without inventing a value -- backfill a sentinel first.
    op.execute("UPDATE report SET file_path = '' WHERE file_path IS NULL")
    op.alter_column("report", "file_path", existing_type=sa.String(1000), nullable=False)
    op.drop_column("report", "content")
