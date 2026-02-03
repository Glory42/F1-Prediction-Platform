```bash
f1-guesser/
├── backend/                # Bun + Express (NestJS-style modules)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── races/      # Controller, Service, Routes
│   │   │   └── predictions/
│   │   ├── shared/         # Supabase client, Types, Middlewares
│   │   └── index.ts        # Entry point
│   ├── .env
│   └── package.json
├── frontend/               # React + Vite + Shadcn + React Query
│   ├── src/
│   │   ├── components/     # UI (Shadcn)
│   │   ├── hooks/          # TanStack Query logic
│   │   ├── services/       # API fetchers
│   │   └── App.tsx
│   └── package.json
├── data-engine/            # Python + FastF1
│   ├── scripts/            # Ingestion & Prediction scripts
│   ├── utils/              # Supabase helpers
│   ├── requirements.txt
│   └── main.py
├── .gitignore
├── README.md
└── LICENSE
```