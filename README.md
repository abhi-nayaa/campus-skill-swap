# Campus Skill Swap

Node.js + Express backend with MongoDB.

## Docker (Single Command)

From project root:

```bash
docker-compose up --build
```

This starts:
- `skillswap_app` on `http://localhost:3000`
- `skillswap_db` (MongoDB) on `localhost:27017`

Mongo data is persisted in the `mongo_data` Docker volume.

## Other Commands

Build image manually:

```bash
docker build -t skillswap .
```

Start existing compose stack:

```bash
docker-compose up
```

Stop stack:

```bash
docker-compose down
```

## Environment

Create `backend/.env` (or copy from `backend/.env.example`):

```env
PORT=3000
MONGO_URI=mongodb://mongo:27017/skillswap
JWT_SECRET=campus_skill_swap_secret_key_2026
NODE_ENV=development
```
