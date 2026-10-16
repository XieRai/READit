"""
FastAPI application factory.
"""

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api.routes import router as api_router

# ---------------------------------------------------------------------------
# Resolve project-root-relative paths
# ---------------------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_STATIC_DIR = _PROJECT_ROOT / "static"
_ASSETS_DIR = _PROJECT_ROOT / "assets"
_TEMPLATE_DIR = _PROJECT_ROOT / "templates"

# ---------------------------------------------------------------------------
# App initialisation
# ---------------------------------------------------------------------------
app = FastAPI(
    title="ScholarLens – Academic Paper Reader",
    version="1.0.0",
    description="Interactive reader for 'Attention Is All You Need' with multi-lens AI explanations.",
)

# CORS – allow everything for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")
app.mount("/assets", StaticFiles(directory=str(_ASSETS_DIR)), name="assets")

# Templates
templates = Jinja2Templates(directory=str(_TEMPLATE_DIR))

# API sub-router
app.include_router(api_router)


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Serve the SaaS landing page."""
    return templates.TemplateResponse(name="index.html", request=request)


@app.get("/hub", response_class=HTMLResponse)
async def hub(request: Request):
    """Serve the READit Document Hub page."""
    return templates.TemplateResponse(name="hub.html", request=request)


@app.get("/documents", response_class=HTMLResponse)
async def documents(request: Request):
    """Alias route for the Document Hub."""
    return templates.TemplateResponse(name="hub.html", request=request)


@app.get("/reader")
async def reader():
    """Redirect legacy reader route to Document Hub SPA."""
    return RedirectResponse(url="/hub", status_code=307)

