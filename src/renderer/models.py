from datetime import datetime, timezone
from typing import Optional
import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class StoredModel(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    parts_json: str                  # JSON-serialised parts array
    source_image: Optional[bytes] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Scene(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SceneInstance(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    scene_id: int = Field(
        sa_column=sa.Column(sa.Integer, sa.ForeignKey("scene.id", ondelete="CASCADE"), index=True, nullable=False),
    )
    model_id: int = Field(
        sa_column=sa.Column(sa.Integer, sa.ForeignKey("storedmodel.id", ondelete="CASCADE"), index=True, nullable=False),
    )
    pos_x: float = 0.0
    pos_y: float = 0.0
    pos_z: float = 0.0
    rot_x: float = 0.0
    rot_y: float = 0.0
    rot_z: float = 0.0
    scale_x: float = 1.0
    scale_y: float = 1.0
    scale_z: float = 1.0
