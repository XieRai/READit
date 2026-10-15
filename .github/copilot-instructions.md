# Copilot instructions for this repo

## Project shape
- This is a small FastAPI app for an academic reading interface: `app/main.py` boots the app, mounts `/static`, renders `templates/index.html`, and includes the API router from `app/api/routes.py`.
- The backend is intentionally simple: route handlers in `app/api/routes.py` delegate to `LLMService` in `app/services/llm_service.py`; avoid adding business logic in routes.
- The UI is server-rendered HTML in `templates/index.html` with Tailwind CDN and vanilla JS in `static/js/app.js`. Styling and interaction transitions live in `static/css/style.css`.
- Keep it framework-free: no Node.js, npm, build pipeline, or frontend framework. Any new UI work should be plain HTML/CSS/ES6 JS.

## Data flow and service boundaries
- User selection in the paper triggers a floating palette in `static/js/app.js`; button clicks POST to `/api/lens` with `{ text, lens_type, context }`.
- `LLMService.resolve_lens()` chooses between Gemini live calls and deterministic mock explanations; the mock path is mandatory for demos when `GEMINI_API_KEY` is unset or invalid.
- `POST /api/prebake` is a paper indexing endpoint that returns `symbols` and `anchors` metadata; this is precomputed in `llm_service.py` and consumed by UI text/anchor features.
- Do not introduce app-wide state or custom JS frameworks; the app relies on DOM listeners and fetch calls already present in `app.js`.

## Conventions and environment
- Config is loaded from `.env` by `app/config.py` via `python-dotenv`; defaults: `HOST=127.0.0.1`, `PORT=8000`.
- `GEMINI_API_KEY` is optional. If missing, the service must still return valid mock responses instead of crashing; this is a core project requirement.
- Keep API contracts aligned with the models in `app/api/routes.py` (`/api/lens`, `/api/prebake`) and the mock payloads in `LLMService`.
- The app is started with `python run.py` (or `uvicorn app.main:app --reload`), not with a Node dev server.

## Frontend patterns to preserve
- Use `.stretch-drawer` accordion behavior for formula expansions; do not replace with modals/popups.
- Keep the floating palette positioned relative to the selected text range and render explanation content inline rather than page-jumping.
- The sample paper and interaction logic are already encoded in `templates/index.html`; follow that style for academic content and lightweight embedded math.
- When changing the UI, prefer updating the existing DOM structure and small vanilla functions in `app.js` over adding a separate state layer.

## Useful examples in this repo
- See `app/services/llm_service.py` for the fallback pattern: `_get_genai_client()` returns `None`, and `_mock_lens()` / `MOCK_PREBAKE` keep the app usable without a key.
- Follow the request/response model in `app/api/routes.py` when adding new endpoints or payloads.
- Reuse the same path-based static/template structure in `app/main.py` when serving any new page or asset.

## Validation workflow
- Run the app locally with `python run.py` and hit the routes in the browser at `http://127.0.0.1:8000/`.
- For API behavior without an API key, verify the mock fallback path still works and returns valid JSON rather than 500s.
- Prefer targeted edits in the matching module rather than broad rewrites: backend logic in `app/services`, route contracts in `app/api`, UI in `static/js` and `templates`.
