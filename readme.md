# READit 📖⚡
> **In-Situ Cognitive Academic Paper Reading Environment & Document Hub**

READit is a high-performance reading environment engineered to eliminate the **Split-Attention Effect** and the **Jargon Wall** when reading complex scientific literature. Instead of forcing readers to bounce between sidebars, modal popups, and dictionary tabs, READit brings inline cognitive deconstructions, active voice simplifications, and AI-powered intuition directly into the text flow.

---

## ✨ Key Features

- **In-Situ Sentence Accordions:** Tap or click any academic sentence to smoothly expand an inline derivation drawer right below the paragraph without losing your reading spot.
- **AI Intuition Lens:** Integrates Google Gemini 2.0 Flash to synthesize complex scholarly concepts into intuitive, plain-language insights.
- **Deterministic Mock Fallbacks:** Fully functional offline or without an API key—deterministic mocks ensure the app runs flawlessly for demonstrations and local tests.
- **Multi-Document Tab System:** Open multiple research papers simultaneously with full HTML5 drag-and-drop tab reordering and keyboard cycling (`Ctrl+Q`).
- **Responsive Mobile Viewport:** Off-canvas sliding sidebar, touch-optimized minimum $44\times 44\text{px}$ touch targets, and a collapsible mobile paper switcher.
- **Zero Frontend Build Step:** Pure Vanilla ES6 JavaScript and Tailwind CSS (via CDN)—no `npm`, no `node_modules`, no Webpack/Vite bundlers required.

---

## 🏗️ Architecture & Project Structure

READit uses a lightweight FastAPI backend paired with a server-rendered Single Page Application (SPA) frontend.

```text
E:\DevDay
├── app/
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py            # API endpoints (/api/lens, /api/prebake)
│   ├── services/
│   │   ├── __init__.py
│   │   └── llm_service.py       # Gemini AI orchestrator & deterministic mock fallbacks
│   ├── config.py                # Typed settings & dynamic on-the-fly .env reloading
│   └── main.py                  # FastAPI factory, static mounts, and Jinja router
├── templates/
│   ├── hub.html                 # Document Hub & In-App Smart Reader (SPA)
│   └── index.html               # Public SaaS product landing page
├── static/
│   ├── css/
│   │   ├── hub.css              # Frosted glassmorphism, drawers, tab animations
│   │   └── landing.css          # Landing page styles and visual elements
│   └── js/
│       ├── hub.js               # Multi-doc tabs, drag-and-drop, PDF.js parsing
│       ├── landing.js           # Landing page interactivity
│       └── tailwind-config.js   # Tailwind theme customizations
├── assets/image/                # Official icons, logos, and preview media
├── .env.example                 # Environment configuration template
├── requirements.txt             # Python backend dependencies
├── run.py                       # Local development server entrypoint
└── start_tunnel.bat             # Cloudflare Tunnel launcher for remote/mobile testing
```

---

## 🚀 Quickstart Guide

### Prerequisites
- **Python 3.10+**
- Git installed

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/readit.git
cd readit
```

### 2. Set Up Virtual Environment
On Windows (PowerShell):
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

On macOS / Linux:
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Copy the example environment configuration:
```bash
cp .env.example .env
```

Open `.env` and configure your settings:
```ini
GEMINI_API_KEY=your_gemini_api_key_here
HOST=127.0.0.1
PORT=8000
```
> [!NOTE]
> `GEMINI_API_KEY` is optional for local development. If omitted or kept as placeholder, READit automatically falls back to built-in mock responses so you can test all features without an API key.

### 5. Launch the Application
```bash
python run.py
```
Open your browser and navigate to:
- **Landing Page:** [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Document Hub & Reader:** [http://127.0.0.1:8000/hub](http://127.0.0.1:8000/hub)

---

## 📱 Mobile Testing via Cloudflare Tunnel

To test the mobile-optimized reader viewport on a physical phone:
1. Ensure your server is running (`python run.py`).
2. Run the tunnel script:
   ```cmd
   start_tunnel.bat
   ```
3. Open the generated `*.trycloudflare.com` URL on your phone's browser.

---

## 🛠️ Development & Contribution Rules

To maintain the architectural integrity of the project, all contributors must observe these core principles:

1. **No Node.js / Build Pipelines:** Keep the frontend in plain HTML, standard CSS, and vanilla ES6 JavaScript. Do not introduce npm packages, TypeScript compilers, or frontend frameworks.
2. **Deterministic Mock Safety:** Any backend feature connecting to LLMs must provide a reliable mock fallback to prevent 500 errors when API keys are absent.
3. **No Automatic Commits / Review-First Workflow:** Always test modifications in your local working tree and review `git status` / `git diff` before committing.

---

## 🗺️ Roadmap

- [x] In-app Document Hub & Multi-tab Reader SPA
- [x] HTML5 Drag-and-Drop tab reordering & keyboard shortcuts (`Ctrl+B`, `Ctrl+Q`)
- [x] Mobile-optimized viewport with drawer navigation
- [ ] Backend PyMuPDF + spaCy 2-column layout & citation parsing pipeline
- [ ] KaTeX mathematical formula rendering for equations & AI explanations
- [ ] Crowdsourced Global Semantic Cache & Supabase Cloud Persistence (3-month LRU TTL)

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).