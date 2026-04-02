project-root/
│
├── frontend/              # React + Phaser
│   ├── src/
│   │   ├── components/    # UI components (Navbar, HUD, Buttons)
│   │   ├── pages/         # Pages (Login, Dashboard, GamePage)
│   │   ├── game/          # 🎮 Phaser Game (IMPORTANT)
│   │   │   ├── scenes/
│   │   │   │   ├── BootScene.js
│   │   │   │   ├── PreloadScene.js
│   │   │   │   ├── GameScene.js
│   │   │   │   └── UIScene.js
│   │   │   │
│   │   │   ├── objects/
│   │   │   │   ├── Hero.js
│   │   │   │   ├── Enemy.js
│   │   │   │   └── Building.js
│   │   │   │
│   │   │   ├── utils/
│   │   │   │   ├── config.js
│   │   │   │   └── helpers.js
│   │   │   │
│   │   │   └── main.js   # Phaser config + game init
│   │   │
│   │   ├── services/     # API calls (axios)
│   │   │   ├── auth.js
│   │   │   └── game.js
│   │   │
│   │   ├── App.jsx
│   │   └── main.jsx
│   │
│   └── public/
│       ├── assets/       # images, sprites, sounds
│       │   ├── hero.png
│       │   ├── enemy.png
│       │   └── tiles.png
│       └── index.html
│
├── backend/              # Node + Prisma + Supabase Postgres
│   ├── prisma/
│   │   └── schema.prisma
│   │
│   ├── controllers/
│   │   ├── authController.js
│   │   └── gameController.js
│   │
│   ├── routes/
│   │   ├── authRoutes.js
│   │   └── gameRoutes.js
│   │
│   ├── middleware/
│   │   └── authMiddleware.js
│   │
│   ├── server.js
│   └── .env
│
└── README.md

SUPABASE:
PASS:Bustillos1333
