"""Vriddhi Career Agent - initial API. Local development only until auth + cloud DB are configured."""
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import create_engine, String, DateTime, Text, select, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./career_agent_dev.sqlite3")
if ENVIRONMENT != "development" and DATABASE_URL.startswith("sqlite"):
    raise RuntimeError("Cloud deployment requires durable DATABASE_URL; SQLite is local-development only")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)

class Base(DeclarativeBase):
    pass

class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (UniqueConstraint("source_url", name="uq_jobs_source_url"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    company: Mapped[str] = mapped_column(String(240), nullable=False)
    source_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

Base.metadata.create_all(engine)

app = FastAPI(title="Vriddhi Career Agent API", version="0.1.0")

class JobIn(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    company: str = Field(min_length=2, max_length=240)
    source_url: HttpUrl
    description: str = Field(default="", max_length=20000)

class DecisionIn(BaseModel):
    status: Literal["approved", "rejected", "hold", "manual"]


def render_job(job: Job):
    return {"id": job.id, "title": job.title, "company": job.company, "source_url": job.source_url, "description": job.description, "status": job.status, "created_at": job.created_at.isoformat(), "updated_at": job.updated_at.isoformat()}

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "vriddhi-career-agent", "environment": ENVIRONMENT}

@app.get("/api/jobs")
def list_jobs(show_rejected: bool = False):
    with SessionLocal() as db:
        statement = select(Job).order_by(Job.created_at.desc())
        if not show_rejected:
            statement = statement.where(Job.status != "rejected")
        return [render_job(j) for j in db.scalars(statement)]

@app.post("/api/jobs", status_code=201)
def create_job(data: JobIn):
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        url = str(data.source_url)
        existing = db.scalar(select(Job).where(Job.source_url == url))
        if existing:
            raise HTTPException(status_code=409, detail="Job source URL is already tracked")
        job = Job(id=str(uuid4()), title=data.title, company=data.company, source_url=url, description=data.description, status="new", created_at=now, updated_at=now)
        db.add(job)
        db.commit()
        db.refresh(job)
        return render_job(job)

@app.patch("/api/jobs/{job_id}/decision")
def change_decision(job_id: str, data: DecisionIn):
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.status not in ("new", "approved", "rejected", "hold", "manual"):
            raise HTTPException(status_code=409, detail="An active application cannot be changed here")
        job.status = data.status
        job.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(job)
        return render_job(job)

FRONTEND_DIR = Path(__file__).resolve().parent / "dist"
if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

    @app.get("/")
    def index():
        return FileResponse(FRONTEND_DIR / "index.html")
