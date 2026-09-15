# Meridian Freight Intelligence — Render deployment

This version is prepared to run as a single Render web service.

## Architecture

- Flask serves the existing frontend files and the `/api/freight-prediction` endpoint from the same public origin.
- The XGBoost model is initialized once and cached in the Flask process.
- No authentication is required by the application.
- The frontend calls `/api/freight-prediction`, so there is no localhost/port dependency in production.

## Render

### Option 1 — Blueprint

Connect the GitHub repository containing this project to Render and select **New → Blueprint**. Render will read `render.yaml` and create the web service.

### Option 2 — Manual Web Service

Use:

- Runtime: Python 3
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn freight_prediction_service.freight_prediction_service:app --bind 0.0.0.0:$PORT --workers 1 --timeout 180`
- Health check: `/api/freight-prediction/health`

No environment variables are required. Render supplies `PORT` automatically.

## Local production-style test

From the project root:

```bash
pip install -r requirements.txt
PORT=5002 gunicorn freight_prediction_service.freight_prediction_service:app --bind 127.0.0.1:5002 --workers 1 --timeout 180
```

Then open `http://127.0.0.1:5002/`.
