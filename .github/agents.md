# Project Overview & Architecture Guide

## Identity & Purpose
An in-situ cognitive academic paper reading environment.
Core goal: Eliminate the Split-Attention Effect and Jargon Wall by providing inline deconstruction (accordion expansion, zero-sidebar floating lenses) without breaking reading flow.

## Tech Stack & Constraints
- **Backend:** Python 3.10+, FastAPI, Uvicorn, Pydantic, python-dotenv, google-genai.
- **Frontend:** Server-rendered Jinja2 template (`templates/index.html`), Tailwind CSS (via CDN), pure vanilla ES6 JavaScript (`static/js/app.js`), custom CSS transitions (`static/css/style.css`).
- **Hard Constraints:** 
  - NO Node.js, NO npm, NO build step, NO frontend frameworks.
  - All new frontend features must stay in vanilla JS/CSS.
  - Always provide fallback mock data if `GEMINI_API_KEY` is unset to prevent 500 crashes during demos.

## Directory Structure & Responsibilities
- `run.py`: Server entrypoint (`uvicorn.run("app.main:app", reload=True)`).
- `app/config.py`: Environment configuration and typed settings.
- `app/main.py`: FastAPI app instance, static mounting, Jinja template engine, and CORS.
- `app/api/routes.py`: API endpoints (`/api/lens`, `/api/prebake`).
- `app/services/llm_service.py`: LLM prompt orchestration, Gemini SDK client, mock fallbacks.
- `templates/index.html`: Base academic paper layout, Tailwind markup.
- `static/css/style.css`: Transition rules for `.stretch-drawer` and `#floating-palette`.
- `static/js/app.js`: DOM event listeners (`mouseup`, `getSelection`), position math, async fetch calls.

## Core Interaction Conventions
1. **Accordion Stretch:** Formula containers must use `.stretch-drawer` with CSS `max-height` transitions to reflow and push subsequent text downward. Never use modal popups for formula breakdowns.
2. **Floating Palette:** Appears above `window.getSelection()` bounding rect. Must provide single-click actions (`intuition`, `eli5`, `math`) and render results in-place without page jumps.
3. **API Contract:**
   - `POST /api/lens`: Input `{ "text": str, "lens_type": "intuition" | "eli5" | "math", "context": dict | null }`. Output `{ "success": bool, "lens_type": str, "explanation": str }`.
   - `POST /api/prebake`: Input `{ "paper_id": str, "content": str }`. Output `{ "symbols": dict, "anchors": dict }`.