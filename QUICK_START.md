# Quick Start Guide

This project delivers a product management platform with an admin panel (for CRUD, bulk Excel import, and media uploads) and a user-facing catalog. Follow the steps below to get everything running locally on Windows with the default React + Express + SQLite stack.

## 1. Prerequisites
- Node.js 18+ and npm
- Git (optional, but useful for source control)
- Excel editor (for preparing `.xlsx` bulk import files)

## 2. Clone or Download
```powershell
# replace with your fork or ZIP path if needed
cd C:\Users\DeLL\Desktop
git clone <repo-url> cilii
cd cilii
```

## 3. Backend Setup (`server`)
```powershell
cd server
npm install
```

Create an `.env` file (same directory) with the configuration you need:
```ini
PORT=4000
DB_FILE=./database.sqlite
```

Run the development server (auto-restarts with nodemon):
```powershell
npm run dev
```

The backend serves:
- REST API at `http://localhost:4000/api/classes`
- Uploaded videos from `http://localhost:4000/uploads`

SQLite data lives at `server/database.sqlite`; uploaded videos are stored in `server/uploads/`.

## 4. Frontend Setup (`client`)
Open a second terminal:
```powershell
cd C:\Users\DeLL\Desktop\cilii\client
npm install
```

Create a `.env` file (same directory) so the client knows where the API is:
```ini
VITE_API_BASE_URL=http://localhost:4000
```

Start the Vite development server:
```powershell
npm run dev
```

Access the app at the printed URL (typically `http://localhost:5173`).
- `Catalog` tab: user-facing product explorer with filters and inline video playback.
- `Admin` tab: CRUD form, Excel bulk upload, video preview, and actions table.

## 5. Bulk Excel Import Tips
- Use `.xlsx` or `.xls` files.
- Expected columns (case-insensitive): `Special ID`, `Main Category`, `Quality`, `Class Name`, `Class Features`, `Class Price`, `Class Video`.
- `Class Video` can contain a relative URL or be left blank. Manual uploads via the form save files to `server/uploads/`.

## 6. Production Build
- Frontend: `cd client && npm run build` outputs to `client/dist/`.
- Backend: Deploy `server/` with `npm install --production` and start via `npm run start`.
- Serve the frontend build with any static host (or add a static middleware to Express).

## 7. Troubleshooting
- **Ports in use**: stop any existing processes or change `PORT` / Vite port.
- **High severity warning for `xlsx`**: run `npm audit` and evaluate mitigations if required for deployment.
- **Videos not playing**: confirm files exist in `server/uploads/` and the URL returned from the API is reachable.

You’re ready to manage and share your product catalog!











