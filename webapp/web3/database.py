"""
Database module — SQLite setup en helpers.
"""

import sqlite3
from pathlib import Path
from flask import g

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "quiz.db"


def get_db():
    """Geef de SQLite-connectie voor deze request (wordt op g bewaard)."""
    if "db" not in g:
        g.db = sqlite3.connect(str(DB_PATH))
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
    return g.db


def close_db(exception=None):
    """Sluit de database na elke request."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Maak de quiz_answers-tabel aan als die nog niet bestaat."""
    db = sqlite3.connect(str(DB_PATH))
    db.execute("""
        CREATE TABLE IF NOT EXISTS quiz_answers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    DEFAULT '',
            answers     TEXT    NOT NULL,
            score       INTEGER NOT NULL DEFAULT 0,
            total       INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT    NOT NULL
        )
    """)
    db.commit()
    db.close()
