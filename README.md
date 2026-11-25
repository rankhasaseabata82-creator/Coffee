<<<<<<< HEAD
# Corner Cup: Coffee Shop Management System

Full-stack coffee shop app. Customers browse the menu, fill a cart and place orders. Staff sign in to manage the menu and move orders through Pending, Preparing, Ready and Collected.

**Stack:** React (Vite), Express.js, MongoDB (primary database), optional Redis (menu cache).

## Local setup

1. Install and start MongoDB Community Server, then connect to it in MongoDB Compass using `mongodb://127.0.0.1:27017`. Compass is the GUI; MongoDB Server must also be running.
2. Backend: `cd server`, copy `.env.example` to `.env`, then run `npm install` and `npm run dev`.
3. Frontend: in another terminal, `cd client`, copy `.env.example` to `.env`, then run `npm install` and `npm run dev`.
4. Open `http://localhost:5173`. The backend API runs at `http://localhost:4000`.

The backend stores menu items and orders in the MongoDB database named `cornercup`. Redis is optional and is used only to cache the menu list. Leave `REDIS_URL` empty to run with MongoDB only. If Redis is configured but unavailable, the backend continues with MongoDB only.

## Environment

`server/.env`:
- `MONGO_URI=mongodb://127.0.0.1:27017/cornercup` (required)
- `REDIS_URL=` (optin URL)
- `STAFF_PASSWORD=` staff login password
- `JWT_SECRET=` long random secret for staff tokens
- `CORS_ORIGIN=http://localhost:5173`

`client/.env`:
- `VITE_API_URL=http://localhost:4000`

## Check connection

Visit `http://localhost:4000/api/health`. It reports MongoDB as the database and Redis as the cache when connected. In MongoDB Compass, refresh databases and open `cornercup`; the `menus` and `orders` collections appear after records are created.

## API

Staff routes need `Authorization: Bearer <token>` from `POST /api/auth/login {password}`.
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | /api/health | public | Check backend/database/cache status |
| POST | /api/auth/login | public | Get a staff token |
| GET | /api/menu | public | All menu items |
| GET | /api/menu/:id | public | One item |
| POST | /api/menu | staff | Add item |
| PUT | /api/menu/:id | staff | Update item |
| DELETE | /api/menu/:id | staff | Delete item |
| POST | /api/orders | public | Place order |
| GET | /api/orders/:id | public | One order |
| GET | /api/orders | staff | All orders |
| GET | /api/orders/summary | staff | Today's count, revenue and status counts |
| PATCH | /api/orders/:id/status | staff | Update order status |

## Important

Do not commit `.env` files or real database credentials to GitHub. The supplied `.env.example` files contain placeholders only.
=======
