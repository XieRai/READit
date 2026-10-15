├── app/               <-- BACKEND ENGINE (Python)
│   ├── config.py      <-- .env loader & settings (like config/*.php)
│   ├── main.py        <-- HTTP server root & middleware (like bootstrap/app.php)
│   ├── api/routes.py  <-- Endpoints & controllers (like routes/api.php)
│   └── services/      <-- AI prompts & business logic (your core models/services)
│
├── templates/         <-- FRONTEND VIEW
│   └── index.html     <-- Page layout & text structure (like resources/views)
│
├── static/            <-- FRONTEND ASSETS
│   ├── css/style.css  <-- Smooth stretch & tooltip transitions
│   └── js/app.js      <-- Click listeners, selection events, fetch calls
│
└── run.py             <-- THE IGNITION SWITCH (starts the server)