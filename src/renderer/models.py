from datetime import UTC, datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class StoredModel(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    parts_json: str  # JSON-serialised parts array
    source_image: bytes | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Scene(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class SceneInstance(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    scene_id: int = Field(
        sa_column=sa.Column(sa.Integer, sa.ForeignKey("scene.id", ondelete="CASCADE"), index=True, nullable=False),
    )
    model_id: int = Field(
        sa_column=sa.Column(
            sa.Integer, sa.ForeignKey("storedmodel.id", ondelete="CASCADE"), index=True, nullable=False
        ),
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


class PartOverride(SQLModel, table=True):
    __table_args__ = (sa.UniqueConstraint("model_id", "part_label", name="uq_partoverride_model_part"),)

    id: int | None = Field(default=None, primary_key=True)
    model_id: int = Field(
        sa_column=sa.Column(
            sa.Integer,
            sa.ForeignKey("storedmodel.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
    )
    part_label: str = Field(max_length=255)
    # Position overrides (absolute — replaces base value when set)
    pos_x: float | None = None
    pos_y: float | None = None
    pos_z: float | None = None
    # Rotation overrides (absolute, radians)
    rot_x: float | None = None
    rot_y: float | None = None
    rot_z: float | None = None
    # Opacity (0.0–1.0; None = use default 1.0)
    opacity: float | None = None
