# Meridian Freight Intelligence — backend

Run from this folder:

```bash
pip install -r requirements.txt
python freight_prediction_service.py
```

API: `POST http://127.0.0.1:5000/api/freight-prediction`

The frontend sends origin, destination, cargo, vessel type and cargo quantity. Quantity is used only to calculate total freight spend, never as an ML feature or vessel-capacity optimizer.
