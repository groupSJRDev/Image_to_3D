import json
import os
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import Session, select

from renderer.database import get_session, init_db
from renderer.extractor import ExtractionError, extract_scene_json
from renderer.models import Scene, SceneInstance, StoredModel
from renderer.prompt import load_prompt

load_dotenv()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="3D Renderer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3010", "http://frontend:3010"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic request / response schemas
# ---------------------------------------------------------------------------

class SaveModelRequest(BaseModel):
    name: str
    parts: list


class RenameModelRequest(BaseModel):
    name: str


class CreateSceneRequest(BaseModel):
    name: str


class AddInstanceRequest(BaseModel):
    model_id: int
    pos_x: float = 0.0
    pos_y: float = 0.0
    pos_z: float = 0.0
    rot_x: float = 0.0
    rot_y: float = 0.0
    rot_z: float = 0.0
    scale_x: float = 1.0
    scale_y: float = 1.0
    scale_z: float = 1.0


class UpdateInstanceRequest(BaseModel):
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    pos_z: Optional[float] = None
    rot_x: Optional[float] = None
    rot_y: Optional[float] = None
    rot_z: Optional[float] = None
    scale_x: Optional[float] = None
    scale_y: Optional[float] = None
    scale_z: Optional[float] = None


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------

@app.post("/api/render")
async def render(image: UploadFile = File(...)):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    image_bytes = await image.read()
    prompt_text = load_prompt()

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-pro-exp")
        model = genai.GenerativeModel(model_name)
        image_part = {"mime_type": image.content_type or "image/jpeg", "data": image_bytes}
        response = model.generate_content([prompt_text, image_part])
        raw_response = response.text
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {exc}")

    try:
        scene = extract_scene_json(raw_response)
    except ExtractionError as exc:
        return {"error": str(exc), "raw_response": exc.raw_response}, 422

    return {"parts": scene["parts"], "raw_response": raw_response}


@app.get("/api/prompt")
def get_prompt():
    return {"prompt": load_prompt()}


# ---------------------------------------------------------------------------
# Model library
# ---------------------------------------------------------------------------

@app.post("/api/models", status_code=201)
def save_model(body: SaveModelRequest, session: Session = Depends(get_session)):
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
def list_models(session: Session = Depends(get_session)):
    rows = session.exec(select(StoredModel)).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "part_count": len(json.loads(r.parts_json)),
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@app.get("/api/models/{model_id}")
def get_model(model_id: int, session: Session = Depends(get_session)):
    stored = session.get(StoredModel, model_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Model not found")
    parts = json.loads(stored.parts_json)
    return {
        "id": stored.id,
        "name": stored.name,
        "part_count": len(parts),
        "created_at": stored.created_at.isoformat(),
        "parts": parts,
    }


@app.patch("/api/models/{model_id}")
def rename_model(model_id: int, body: RenameModelRequest, session: Session = Depends(get_session)):
    stored = session.get(StoredModel, model_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Model not found")
    stored.name = body.name
    session.add(stored)
    session.commit()
    session.refresh(stored)
    return {"id": stored.id, "name": stored.name}


@app.delete("/api/models/{model_id}", status_code=204)
def delete_model(model_id: int, session: Session = Depends(get_session)):
    stored = session.get(StoredModel, model_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Model not found")
    session.delete(stored)
    session.commit()


# ---------------------------------------------------------------------------
# Scene composer
# ---------------------------------------------------------------------------

@app.post("/api/scenes", status_code=201)
def create_scene(body: CreateSceneRequest, session: Session = Depends(get_session)):
    scene = Scene(name=body.name)
    session.add(scene)
    session.commit()
    session.refresh(scene)
    return {"id": scene.id, "name": scene.name, "instances": []}


@app.get("/api/scenes")
def list_scenes(session: Session = Depends(get_session)):
    scenes = session.exec(select(Scene)).all()
    return [{"id": s.id, "name": s.name, "created_at": s.created_at.isoformat()} for s in scenes]


@app.get("/api/scenes/{scene_id}")
def get_scene(scene_id: int, session: Session = Depends(get_session)):
    scene = session.get(Scene, scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    instances = session.exec(
        select(SceneInstance).where(SceneInstance.scene_id == scene_id)
    ).all()
    return {
        "id": scene.id,
        "name": scene.name,
        "instances": [_serialise_instance(inst, session) for inst in instances],
    }


@app.delete("/api/scenes/{scene_id}", status_code=204)
def delete_scene(scene_id: int, session: Session = Depends(get_session)):
    scene = session.get(Scene, scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    instances = session.exec(
        select(SceneInstance).where(SceneInstance.scene_id == scene_id)
    ).all()
    for inst in instances:
        session.delete(inst)
    session.delete(scene)
    session.commit()


@app.post("/api/scenes/{scene_id}/instances", status_code=201)
def add_instance(scene_id: int, body: AddInstanceRequest, session: Session = Depends(get_session)):
    if not session.get(Scene, scene_id):
        raise HTTPException(status_code=404, detail="Scene not found")
    if not session.get(StoredModel, body.model_id):
        raise HTTPException(status_code=404, detail="Model not found")
    inst = SceneInstance(scene_id=scene_id, **body.model_dump())
    session.add(inst)
    session.commit()
    session.refresh(inst)
    return _serialise_instance(inst, session)


@app.patch("/api/scenes/{scene_id}/instances/{instance_id}")
def update_instance(
    scene_id: int,
    instance_id: int,
    body: UpdateInstanceRequest,
    session: Session = Depends(get_session),
):
    inst = session.get(SceneInstance, instance_id)
    if not inst or inst.scene_id != scene_id:
        raise HTTPException(status_code=404, detail="Instance not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(inst, field, value)
    session.add(inst)
    session.commit()
    session.refresh(inst)
    return _serialise_instance(inst, session)


@app.delete("/api/scenes/{scene_id}/instances/{instance_id}", status_code=204)
def remove_instance(scene_id: int, instance_id: int, session: Session = Depends(get_session)):
    inst = session.get(SceneInstance, instance_id)
    if not inst or inst.scene_id != scene_id:
        raise HTTPException(status_code=404, detail="Instance not found")
    session.delete(inst)
    session.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialise_instance(inst: SceneInstance, session: Session) -> dict:
    stored = session.get(StoredModel, inst.model_id)
    return {
        "id": inst.id,
        "model_id": inst.model_id,
        "model_name": stored.name if stored else "unknown",
        "parts": json.loads(stored.parts_json) if stored else [],
        "position": {"x": inst.pos_x, "y": inst.pos_y, "z": inst.pos_z},
        "rotation": {"x": inst.rot_x, "y": inst.rot_y, "z": inst.rot_z},
        "scale": {"x": inst.scale_x, "y": inst.scale_y, "z": inst.scale_z},
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def start():
    uvicorn.run("renderer.server:app", host="0.0.0.0", port=8010, reload=True)
