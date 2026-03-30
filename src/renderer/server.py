import json
import json as json_mod
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlmodel import Session, select

from renderer.database import get_session, init_db
from renderer.extractor import ExtractionError, extract_scene_json
from renderer.models import Scene, SceneInstance, StoredModel
from renderer.prompt import load_prompt, validate_prompt_exists

load_dotenv()

logger = logging.getLogger(__name__)

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAGIC_BYTES = {
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/webp": b"RIFF",
}


class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json_mod.dumps(log_entry)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        handlers=[handler],
    )
    validate_prompt_exists()
    init_db()
    logger.info("Server started, database initialized")
    yield


app = FastAPI(title="3D Renderer API", lifespan=lifespan)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_default_origins = ["http://localhost:3010", "http://frontend:3010"]
_cors_origins = os.getenv("CORS_ORIGINS")
_origins = [o.strip() for o in _cors_origins.split(",") if o.strip()] if _cors_origins else _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic request / response schemas
# ---------------------------------------------------------------------------

class SaveModelRequest(BaseModel):
    name: str = Field(max_length=255)
    parts: list = Field(max_length=1000)


class RenameModelRequest(BaseModel):
    name: str = Field(max_length=255)


class CreateSceneRequest(BaseModel):
    name: str = Field(max_length=255)


class AddInstanceRequest(BaseModel):
    model_id: int
    pos_x: float = Field(default=0.0, ge=-1000, le=1000)
    pos_y: float = Field(default=0.0, ge=-1000, le=1000)
    pos_z: float = Field(default=0.0, ge=-1000, le=1000)
    rot_x: float = Field(default=0.0, ge=-6.284, le=6.284)
    rot_y: float = Field(default=0.0, ge=-6.284, le=6.284)
    rot_z: float = Field(default=0.0, ge=-6.284, le=6.284)
    scale_x: float = Field(default=1.0, ge=0.001, le=100)
    scale_y: float = Field(default=1.0, ge=0.001, le=100)
    scale_z: float = Field(default=1.0, ge=0.001, le=100)


class UpdateInstanceRequest(BaseModel):
    pos_x: Optional[float] = Field(default=None, ge=-1000, le=1000)
    pos_y: Optional[float] = Field(default=None, ge=-1000, le=1000)
    pos_z: Optional[float] = Field(default=None, ge=-1000, le=1000)
    rot_x: Optional[float] = Field(default=None, ge=-6.284, le=6.284)
    rot_y: Optional[float] = Field(default=None, ge=-6.284, le=6.284)
    rot_z: Optional[float] = Field(default=None, ge=-6.284, le=6.284)
    scale_x: Optional[float] = Field(default=None, ge=0.001, le=100)
    scale_y: Optional[float] = Field(default=None, ge=0.001, le=100)
    scale_z: Optional[float] = Field(default=None, ge=0.001, le=100)


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------

@app.post("/api/render")
@limiter.limit(os.getenv("RATE_LIMIT", "10/minute"))
async def render(request: Request, image: UploadFile = File(...)) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY not configured")
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    image_bytes = await image.read()

    # --- Upload validation (audit 1.2) ---
    if len(image_bytes) > MAX_UPLOAD_SIZE:
        logger.warning("Upload rejected: size %d exceeds limit", len(image_bytes))
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")

    content_type = image.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES:
        logger.warning("Upload rejected: unsupported content_type=%s", content_type)
        raise HTTPException(status_code=415, detail="Unsupported image type")

    expected_magic = MAGIC_BYTES.get(content_type, b"")
    if not image_bytes.startswith(expected_magic):
        logger.warning("Magic byte mismatch: claimed %s", content_type)
        raise HTTPException(status_code=415, detail="File content does not match declared type")

    if content_type == "image/webp" and image_bytes[8:12] != b"WEBP":
        logger.warning("WebP magic byte mismatch")
        raise HTTPException(status_code=415, detail="File content does not match declared type")

    logger.info("Render request received, content_type=%s, size=%d", content_type, len(image_bytes))
    prompt_text = load_prompt()

    # --- Gemini API call with specific exception handling (audit 1.3) ---
    try:
        import google.generativeai as genai
        import google.api_core.exceptions

        genai.configure(api_key=api_key)
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-pro-exp")
        model = genai.GenerativeModel(model_name)
        image_part = {"mime_type": content_type, "data": image_bytes}
        logger.info("Calling Gemini API, model=%s", model_name)
        t0 = time.monotonic()
        response = model.generate_content([prompt_text, image_part])
        duration_ms = (time.monotonic() - t0) * 1000
        raw_response = response.text
        logger.info("Gemini response received in %.1fms", duration_ms)
    except google.api_core.exceptions.GoogleAPIError as exc:
        logger.error("Gemini API error: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail="AI model service error")
    except (ConnectionError, TimeoutError) as exc:
        logger.error("Network error calling Gemini: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail="AI model service unavailable")
    except Exception as exc:
        logger.exception("Unexpected error in render endpoint")
        raise HTTPException(status_code=500, detail="Internal server error")

    try:
        scene = extract_scene_json(raw_response)
    except ExtractionError as exc:
        logger.warning("Extraction failed: %s", exc)
        raise HTTPException(
            status_code=422,
            detail={"error": str(exc), "raw_response": exc.raw_response},
        )

    logger.info("Extraction complete, %d parts", len(scene["parts"]))
    logger.debug("Raw LLM response: %s", raw_response)
    return {"parts": scene["parts"], "raw_response": raw_response}


@app.get("/api/prompt")
def get_prompt() -> dict:
    return {"prompt": load_prompt()}


# ---------------------------------------------------------------------------
# Model library
# ---------------------------------------------------------------------------

@app.post("/api/models", status_code=201)
def save_model(body: SaveModelRequest, session: Session = Depends(get_session)) -> dict:
    stored = StoredModel(name=body.name, parts_json=json.dumps(body.parts))
    session.add(stored)
    session.commit()
    session.refresh(stored)
    return {
        "id": stored.id,
        "name": stored.name,
        "part_count": len(body.parts),
        "created_at": stored.created_at.isoformat(),
    }


@app.get("/api/models")
def list_models(session: Session = Depends(get_session)) -> list[dict]:
    rows = session.exec(select(StoredModel)).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "part_count": len(_safe_load_parts(r.parts_json)),
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@app.get("/api/models/{model_id}")
def get_model(model_id: int, session: Session = Depends(get_session)) -> dict:
    stored = session.get(StoredModel, model_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Model not found")
    parts = _safe_load_parts(stored.parts_json)
    return {
        "id": stored.id,
        "name": stored.name,
        "part_count": len(parts),
        "created_at": stored.created_at.isoformat(),
        "parts": parts,
    }


@app.patch("/api/models/{model_id}")
def rename_model(model_id: int, body: RenameModelRequest, session: Session = Depends(get_session)) -> dict:
    stored = session.get(StoredModel, model_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Model not found")
    stored.name = body.name
    session.add(stored)
    session.commit()
    session.refresh(stored)
    return {"id": stored.id, "name": stored.name}


@app.delete("/api/models/{model_id}", status_code=204)
def delete_model(model_id: int, session: Session = Depends(get_session)) -> None:
    stored = session.get(StoredModel, model_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Model not found")
    session.delete(stored)
    session.commit()


# ---------------------------------------------------------------------------
# Scene composer
# ---------------------------------------------------------------------------

@app.post("/api/scenes", status_code=201)
def create_scene(body: CreateSceneRequest, session: Session = Depends(get_session)) -> dict:
    scene = Scene(name=body.name)
    session.add(scene)
    session.commit()
    session.refresh(scene)
    return {"id": scene.id, "name": scene.name, "instances": []}


@app.get("/api/scenes")
def list_scenes(session: Session = Depends(get_session)) -> list[dict]:
    scenes = session.exec(select(Scene)).all()
    return [{"id": s.id, "name": s.name, "created_at": s.created_at.isoformat()} for s in scenes]


@app.get("/api/scenes/{scene_id}")
def get_scene(scene_id: int, session: Session = Depends(get_session)) -> dict:
    scene = session.get(Scene, scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    instances = session.exec(
        select(SceneInstance).where(SceneInstance.scene_id == scene_id)
    ).all()
    # Bulk-load referenced models to avoid N+1 queries
    model_ids = {inst.model_id for inst in instances}
    if model_ids:
        models_list = session.exec(
            select(StoredModel).where(StoredModel.id.in_(model_ids))  # type: ignore[union-attr]
        ).all()
        models_by_id = {m.id: m for m in models_list}
    else:
        models_by_id = {}
    return {
        "id": scene.id,
        "name": scene.name,
        "instances": [_serialise_instance(inst, models_by_id.get(inst.model_id)) for inst in instances],
    }


@app.delete("/api/scenes/{scene_id}", status_code=204)
def delete_scene(scene_id: int, session: Session = Depends(get_session)) -> None:
    scene = session.get(Scene, scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    session.delete(scene)
    session.commit()


@app.post("/api/scenes/{scene_id}/instances", status_code=201)
def add_instance(scene_id: int, body: AddInstanceRequest, session: Session = Depends(get_session)) -> dict:
    if not session.get(Scene, scene_id):
        raise HTTPException(status_code=404, detail="Scene not found")
    stored = session.get(StoredModel, body.model_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Model not found")
    inst = SceneInstance(scene_id=scene_id, **body.model_dump())
    session.add(inst)
    session.commit()
    session.refresh(inst)
    return _serialise_instance(inst, stored)


@app.patch("/api/scenes/{scene_id}/instances/{instance_id}")
def update_instance(
    scene_id: int,
    instance_id: int,
    body: UpdateInstanceRequest,
    session: Session = Depends(get_session),
) -> dict:
    inst = session.get(SceneInstance, instance_id)
    if not inst or inst.scene_id != scene_id:
        raise HTTPException(status_code=404, detail="Instance not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(inst, field, value)
    session.add(inst)
    session.commit()
    session.refresh(inst)
    stored = session.get(StoredModel, inst.model_id)
    return _serialise_instance(inst, stored)


@app.delete("/api/scenes/{scene_id}/instances/{instance_id}", status_code=204)
def remove_instance(scene_id: int, instance_id: int, session: Session = Depends(get_session)) -> None:
    inst = session.get(SceneInstance, instance_id)
    if not inst or inst.scene_id != scene_id:
        raise HTTPException(status_code=404, detail="Instance not found")
    session.delete(inst)
    session.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_load_parts(parts_json: str) -> list:
    try:
        data = json.loads(parts_json)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        logger.warning("Corrupt parts_json in database: %s", parts_json[:200])
        return []


def _serialise_instance(inst: SceneInstance, stored: Optional[StoredModel]) -> dict:
    return {
        "id": inst.id,
        "model_id": inst.model_id,
        "model_name": stored.name if stored else "unknown",
        "parts": _safe_load_parts(stored.parts_json) if stored else [],
        "position": {"x": inst.pos_x, "y": inst.pos_y, "z": inst.pos_z},
        "rotation": {"x": inst.rot_x, "y": inst.rot_y, "z": inst.rot_z},
        "scale": {"x": inst.scale_x, "y": inst.scale_y, "z": inst.scale_z},
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def start():
    uvicorn.run(
        "renderer.server:app",
        host="0.0.0.0",
        port=8010,
        reload=os.getenv("ENV") != "production",
    )
