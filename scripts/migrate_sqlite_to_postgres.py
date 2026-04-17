"""Migrate Agent-SaveMark data from SQLite to PostgreSQL."""

from __future__ import annotations

import argparse
import json
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy import MetaData, create_engine, inspect, select, text
from sqlmodel import SQLModel

import agentpocket.models  # noqa: F401


def _normalize_datetime(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def _convert_value(value, target_column):
    if value is None:
        return None

    type_name = target_column.type.__class__.__name__.lower()

    if "uuid" in type_name and isinstance(value, str):
        return uuid.UUID(value)

    if type_name in {"json", "jsonb"} and isinstance(value, str):
        return json.loads(value)

    if "bool" in type_name and isinstance(value, int):
        return bool(value)

    if "datetime" in type_name and isinstance(value, str):
        return _normalize_datetime(value)

    return value


def _truncate_target_tables(target_engine, table_names: list[str]) -> None:
    if not table_names:
        return

    quoted_tables = ", ".join(f'"{name}"' for name in table_names)
    with target_engine.begin() as connection:
        connection.execute(text(f"TRUNCATE TABLE {quoted_tables} RESTART IDENTITY CASCADE"))


def _sync_sequences(target_engine, table_names: list[str]) -> None:
    inspector = inspect(target_engine)
    with target_engine.begin() as connection:
        for table_name in table_names:
            pk = inspector.get_pk_constraint(table_name).get("constrained_columns") or []
            if len(pk) != 1:
                continue

            column_name = pk[0]
            columns = {column["name"]: column for column in inspector.get_columns(table_name)}
            column = columns.get(column_name)
            if not column:
                continue

            python_type = getattr(column["type"], "python_type", None)
            if python_type not in {int}:
                continue

            sequence_name = connection.execute(
                text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
                {"table_name": table_name, "column_name": column_name},
            ).scalar_one_or_none()
            if not sequence_name:
                continue

            connection.execute(
                text(
                    f"SELECT setval(:sequence_name, "
                    f"COALESCE((SELECT MAX(\"{column_name}\") FROM \"{table_name}\"), 1), true)"
                ),
                {"sequence_name": sequence_name},
            )


def migrate(sqlite_url: str, postgres_url: str, batch_size: int) -> None:
    source_engine = create_engine(sqlite_url)
    target_engine = create_engine(postgres_url)

    SQLModel.metadata.create_all(target_engine)

    source_metadata = MetaData()
    source_metadata.reflect(bind=source_engine)

    target_metadata = MetaData()
    target_metadata.reflect(bind=target_engine)

    table_names = [
        table.name
        for table in SQLModel.metadata.sorted_tables
        if table.name in source_metadata.tables and table.name in target_metadata.tables
    ]

    _truncate_target_tables(target_engine, table_names)

    with source_engine.connect() as source_connection, target_engine.begin() as target_connection:
        for table_name in table_names:
            source_table = source_metadata.tables[table_name]
            target_table = target_metadata.tables[table_name]

            rows = source_connection.execute(select(source_table)).mappings().all()
            if not rows:
                print(f"{table_name}: 0 rows")
                continue

            payload = []
            for row in rows:
                converted = {
                    column.name: _convert_value(row[column.name], column)
                    for column in target_table.columns
                    if column.name in row
                }
                payload.append(converted)

            for offset in range(0, len(payload), batch_size):
                batch = payload[offset:offset + batch_size]
                target_connection.execute(target_table.insert(), batch)

            print(f"{table_name}: {len(payload)} rows")

    _sync_sequences(target_engine, table_names)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sqlite-url",
        default=f"sqlite:///{Path.cwd() / 'data' / 'Agent-SaveMark.db'}",
        help="SQLite source URL",
    )
    parser.add_argument(
        "--postgres-url",
        default="postgresql://agent:agent@localhost:5432/Agent-SaveMark",
        help="PostgreSQL target URL",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Number of rows per insert batch",
    )
    args = parser.parse_args()

    migrate(args.sqlite_url, args.postgres_url, args.batch_size)


if __name__ == "__main__":
    main()