from datetime import datetime, timezone
from uuid import UUID

from cryptography.fernet import InvalidToken
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.data_source import DataSource
from app.models.table_asset import TableAsset
from app.services.connectors.postgres_csvlog import PostgresCsvlogConnector
from app.core.crypto import decrypt_secret


class CredentialDecryptionError(RuntimeError):
    """The stored credential can't be decrypted with the current key.

    Almost always means CREDENTIALS_ENCRYPTION_KEY was rotated or restored
    from a different environment without re-encrypting existing rows. It's
    unrecoverable without the old key, so it needs to surface as a clear,
    actionable message -- not the opaque 500 that an InvalidToken escaping
    from here used to produce on every connection test and every worker
    poll.
    """


def build_connector(data_source: DataSource) -> PostgresCsvlogConnector:
    try:
        password = decrypt_secret(data_source.encrypted_password)
    except InvalidToken as exc:
        raise CredentialDecryptionError(
            f"Stored credential for data source {data_source.id} cannot be decrypted with the current "
            "CREDENTIALS_ENCRYPTION_KEY. Re-enter the credential, or restore the key it was encrypted with."
        ) from exc

    return PostgresCsvlogConnector(
        host=data_source.host,
        port=data_source.port,
        dbname=data_source.dbname,
        username=data_source.username,
        password=password,
        log_directory=data_source.log_directory,
    )


def sync_tables(db: Session, workspace_id: UUID, data_source: DataSource) -> list[TableAsset]:
    """Discovers current tables and reconciles against table_asset:
    new ones are inserted, ones no longer present are soft-deleted
    (dropped_at set) rather than removed, so historical access_events and
    classification history referencing them stay intact (spec 5)."""
    connector = build_connector(data_source)
    discovered = set(connector.discover_tables())

    existing = db.scalars(
        select(TableAsset).where(
            TableAsset.data_source_id == data_source.id,
            TableAsset.dropped_at.is_(None),
        )
    ).all()
    existing_keys = {(t.schema_name, t.table_name): t for t in existing}

    now = datetime.now(timezone.utc)
    for key, table in existing_keys.items():
        if key not in discovered:
            table.dropped_at = now

    for schema_name, table_name in discovered:
        if (schema_name, table_name) not in existing_keys:
            db.add(
                TableAsset(
                    workspace_id=workspace_id,
                    data_source_id=data_source.id,
                    schema_name=schema_name,
                    table_name=table_name,
                )
            )

    db.flush()
    return db.scalars(
        select(TableAsset).where(TableAsset.data_source_id == data_source.id, TableAsset.dropped_at.is_(None))
    ).all()
