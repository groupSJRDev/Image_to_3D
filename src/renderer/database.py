import os
from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./renderer.db")

# connect_args only applies to SQLite
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=_connect_args)


def init_db() -> None:
    """Create all tables. Called once at server startup."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency — yields a session and closes it after the request."""
    with Session(engine) as session:
        yield session
