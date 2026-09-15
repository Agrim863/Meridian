from __future__ import annotations

import os
from functools import lru_cache

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBRegressor

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "freight_dataset.csv")
SEASONAL_WEIGHT = 0.10

# Frontend-friendly aliases -> dataset names
PORT_ALIASES = {
    "Port Hedland": "Hedland",
    "Hedland": "Hedland",
    "Paradip": "Paradip",
    "Visakhapatnam": "Visakhapatnam",
    "Beira": "Beira",
    "Nacala": "Nacala",
    "Maputo": "Maputo",
    "Gladstone": "Gladstone",
}

CARGO_ALIASES = {
    "Fertilizer": "Fertilizer",
    "Fertiliser": "Fertilizer",
    "fertilizer": "Fertilizer",
    "fertiliser": "Fertilizer",
    "Manganese": "Manganese Ore",
    "Manganese Ore": "Manganese Ore",
    "manganeseOre": "Manganese Ore",
    "manganese_ore": "Manganese Ore",
    "Iron Ore": "Iron Ore",
    "ironOre": "Iron Ore",
    "iron_ore": "Iron Ore",
    "Coal": "Coal",
    "coal": "Coal",
    "Thermal Coal": "Coal",
    "thermalCoal": "Coal",
    "thermal_coal": "Coal",
    "Coking Coal": "Coal",
    "cokingCoal": "Coal",
    "coking_coal": "Coal",
}

SUPPORTED_FREIGHT_ORIGINS = {"Beira", "Gladstone", "Hedland", "Maputo", "Nacala"}
SUPPORTED_FREIGHT_DESTINATIONS = {"Paradip", "Visakhapatnam"}

VESSEL_ALIASES = {
    "Handy": "Handysize",
    "Handysize": "Handysize",
    "handysize": "Handysize",
    "Supramax": "Supramax",
    "supramax": "Supramax",
    "Ultramax": "Supramax",
    "ultramax": "Supramax",
    "Panamax": "Panamax",
    "panamax": "Panamax",
    "Kamsarmax": "Panamax",
    "kamsarmax": "Panamax",
    "Capesize": "Capesize",
    "capesize": "Capesize",
}


def resolve_alias(mapping: dict, value) -> str | None:
    """Resolve frontend IDs/display labels case-insensitively."""
    raw = str(value or "").strip()
    if raw in mapping:
        return mapping[raw]
    folded = raw.casefold()
    for key, resolved in mapping.items():
        if str(key).casefold() == folded:
            return resolved
    return None



def load_dataset() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, parse_dates=["date"])
    df = df.sort_values("date").reset_index(drop=True)
    return df


def add_model_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Same economic baseline used by the final working model.
    df["economic_baseline_usd_t"] = (
        df["fuel_cost_usd_t_proxy"] + df["vessel_opex_usd_t_proxy"]
    )

    commodity_map = {
        "Coal": "coal_price_usd_t",
        "Iron Ore": "iron_ore_price_usd_t",
        "Fertilizer": "fertilizer_index",
        "Manganese Ore": "manganese_price_cny_mtu",
    }
    df["relevant_commodity_price"] = np.nan
    for cargo, column in commodity_map.items():
        mask = df["cargo"].eq(cargo)
        df.loc[mask, "relevant_commodity_price"] = df.loc[mask, column]

    month = df["date"].dt.month
    df["month_sin"] = np.sin(2 * np.pi * month / 12)
    df["month_cos"] = np.cos(2 * np.pi * month / 12)
    return df


NUMERIC_FEATURES = [
    "economic_baseline_usd_t",
    "bdi",
    "bpi",
    "bunker_usd_t",
    "relevant_commodity_price",
    "bdi_change_pct",
    "bpi_change_pct",
    "bunker_change_pct",
    "month_sin",
    "month_cos",
]

CATEGORICAL_FEATURES = [
    "origin_port",
    "destination_port",
    "cargo",
    "vessel_type",
]

MODEL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def build_model() -> Pipeline:
    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )

    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            (
                "onehot",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
            ),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, NUMERIC_FEATURES),
            ("cat", categorical_pipeline, CATEGORICAL_FEATURES),
        ]
    )

    regressor = XGBRegressor(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=3,
        min_child_weight=5,
        subsample=0.8,
        colsample_bytree=0.8,
        objective="reg:squarederror",
        random_state=42,
        n_jobs=-1,
    )

    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", regressor),
        ]
    )


def calculate_seasonal_change(
    history: pd.DataFrame,
    origin_port: str,
    destination_port: str,
    cargo: str,
    vessel_type: str,
    current_date: pd.Timestamp,
    horizon: int,
) -> tuple[float, str]:
    """Historical month-to-future-month $/t change with the final model's fallback hierarchy."""

    hist = history[
        (history["date"] < current_date)
        & (history["target_status"] == "EXISTING_OBSERVATION")
    ].copy()

    if hist.empty:
        return 0.0, "none"

    # Add calendar month fields for seasonal matching.
    hist["month_num"] = hist["date"].dt.month
    current_month = current_date.month
    future_month = (current_month - 1 + horizon) % 12 + 1

    levels = [
        (
            ["origin_port", "destination_port", "cargo", "vessel_type"],
            "route+cargo+vessel",
        ),
        (["cargo"], "cargo"),
        (["vessel_type"], "vessel"),
        ([], "global"),
    ]

    for keys, source_name in levels:
        subset = hist
        if keys:
            values = {
                "origin_port": origin_port,
                "destination_port": destination_port,
                "cargo": cargo,
                "vessel_type": vessel_type,
            }
            for key in keys:
                subset = subset[subset[key] == values[key]]

        # Pair observations from the same historical year so the change is
        # genuinely current-month -> future-month seasonal movement.
        if subset.empty:
            continue

        pivot = subset.pivot_table(
            index=subset["date"].dt.year,
            columns="month_num",
            values="estimated_route_freight_usd_t",
            aggfunc="mean",
        )

        if current_month not in pivot.columns or future_month not in pivot.columns:
            continue

        changes = pivot[future_month] - pivot[current_month]
        changes = changes.dropna()
        if len(changes) > 0:
            return float(changes.mean()), source_name

    return 0.0, "none"


def normalize_inputs(data: dict) -> tuple[str, str, str, str]:
    origin = resolve_alias(PORT_ALIASES, data.get("origin_port"))
    destination = resolve_alias(PORT_ALIASES, data.get("destination_port"))
    cargo = resolve_alias(CARGO_ALIASES, data.get("cargo"))
    vessel = resolve_alias(VESSEL_ALIASES, data.get("vessel_type"))

    missing = []
    if not origin:
        missing.append("origin_port")
    if not destination:
        missing.append("destination_port")
    if not cargo:
        missing.append("cargo")
    if not vessel:
        missing.append("vessel_type")
    if missing:
        raise ValueError(
            f"Invalid input for: {', '.join(missing)}. "
            "Accepted cargo values include Coal, Thermal Coal, Coking Coal, Iron Ore, Fertilizer, Manganese Ore."
        )

    # The prototype's freight dataset is specifically calibrated for the
    # procurement direction: overseas origin -> East Coast India destination.
    # Do not silently reverse the lane, because freight markets are directional.
    if origin not in SUPPORTED_FREIGHT_ORIGINS or destination not in SUPPORTED_FREIGHT_DESTINATIONS:
        raise ValueError(
            "Unsupported freight lane. This prototype forecasts overseas → East Coast India routes only. "
            "Use Beira, Gladstone, Hedland (Port Hedland), Maputo, or Nacala as origin and "
            "Paradip or Visakhapatnam as destination."
        )

    return origin, destination, cargo, vessel


@lru_cache(maxsize=1)
def initialize() -> tuple[pd.DataFrame, pd.DataFrame, Pipeline, pd.Timestamp]:
    df = add_model_features(load_dataset())
    latest_date = df["date"].max()

    # Final working-model behaviour: train using all rows before the latest
    # available month, then predict the latest month.
    train_df = df[df["date"] < latest_date].copy()
    latest_df = df[df["date"] == latest_date].copy()

    # The ML model learns the market adjustment around the economic baseline.
    train_target = (
        train_df["estimated_route_freight_usd_t"]
        - train_df["economic_baseline_usd_t"]
    )

    model = build_model()
    model.fit(train_df[MODEL_FEATURES], train_target)

    latest_df["predicted_market_adjustment"] = model.predict(
        latest_df[MODEL_FEATURES]
    )
    latest_df["current_freight_usd_t"] = (
        latest_df["economic_baseline_usd_t"]
        + latest_df["predicted_market_adjustment"]
    )

    return df, latest_df, model, latest_date


def decision_engine(current: float, month_1: float, month_2: float, row: pd.Series, cargo: str, vessel_type: str, origin: str, destination: str) -> dict:
    """Transparent prototype decision layer. It does not optimize vessel capacity from cargo quantity."""
    d1 = month_1 - current
    d2 = month_2 - current
    baseline = float(row.get("economic_baseline_usd_t", np.nan))
    market_adjustment = current - baseline if np.isfinite(baseline) else np.nan

    if d1 > 0.20:
        market_signal = "Firming"
    elif d1 < -0.20:
        market_signal = "Easing"
    else:
        market_signal = "Stable"

    if d1 > 0.20 and d2 >= d1 * 0.25:
        title = "Consider locking freight"
        short = "Near-term freight pressure is upward."
    elif d1 < -0.20 and d2 <= 0.05:
        title = "Waiting may be favourable"
        short = "The near-term curve is easing."
    else:
        title = "Monitor before fixing"
        short = "The near-term curve has no strong directional signal."

    if d1 > 0.05:
        move = "Higher next month"
    elif d1 < -0.05:
        move = "Lower next month"
    else:
        move = "Broadly flat"

    if np.isfinite(market_adjustment) and market_adjustment > 0:
        economics = "Above voyage-cost floor"
    elif np.isfinite(market_adjustment):
        economics = "Near/below voyage-cost floor"
    else:
        economics = "Baseline unavailable"

    explanation = (
        f"{market_signal} freight on {origin} → {destination}. "
        f"The model estimates ${current:.2f}/t now versus ${month_1:.2f}/t next month. "
    )
    if title == "Consider locking freight":
        explanation += "Locking earlier can reduce exposure to the projected upward move."
    elif title == "Waiting may be favourable":
        explanation += "A short wait may offer a lower freight level if the market follows the projected curve."
    else:
        explanation += "With only a modest projected move, timing is less decisive and should be monitored."

    return {
        "title": title,
        "short_reason": short,
        "market_signal": market_signal,
        "near_term_move": move,
        "economic_signal": economics,
        "explanation": explanation,
    }


def predict_freight(
    origin_port: str,
    destination_port: str,
    cargo: str,
    vessel_type: str,
    cargo_quantity_t: float | None = None,
) -> dict:
    df, latest_predictions, _, latest_date = initialize()

    origin_port = resolve_alias(PORT_ALIASES, origin_port) or origin_port
    destination_port = resolve_alias(PORT_ALIASES, destination_port) or destination_port
    cargo = resolve_alias(CARGO_ALIASES, cargo) or cargo
    vessel_type = resolve_alias(VESSEL_ALIASES, vessel_type) or vessel_type

    row = latest_predictions[
        (latest_predictions["origin_port"] == origin_port)
        & (latest_predictions["destination_port"] == destination_port)
        & (latest_predictions["cargo"] == cargo)
        & (latest_predictions["vessel_type"] == vessel_type)
    ]

    if row.empty:
        raise ValueError("No matching route/cargo/vessel combination in the dataset.")

    row = row.iloc[0]
    current = float(row["current_freight_usd_t"])

    change_1, source_1 = calculate_seasonal_change(
        df, origin_port, destination_port, cargo, vessel_type, latest_date, 1
    )
    change_2, source_2 = calculate_seasonal_change(
        df, origin_port, destination_port, cargo, vessel_type, latest_date, 2
    )

    # Both future projections start from the current forecast; +2 is not recursive.
    month_1 = current + SEASONAL_WEIGHT * change_1
    month_2 = current + SEASONAL_WEIGHT * change_2

    decision = decision_engine(
        current, month_1, month_2, row, cargo, vessel_type, origin_port, destination_port
    )

    result = {
        "forecast_month": latest_date.strftime("%B %Y"),
        "origin_port": origin_port,
        "destination_port": destination_port,
        "cargo": cargo,
        "vessel_type": vessel_type,
        "current_freight_usd_t": round(current, 2),
        "forecast_plus_1_usd_t": round(month_1, 2),
        "forecast_plus_2_usd_t": round(month_2, 2),
        "seasonal_weight": SEASONAL_WEIGHT,
        "seasonal_source_plus_1": source_1,
        "seasonal_source_plus_2": source_2,
        "economic_baseline_usd_t": round(float(row["economic_baseline_usd_t"]), 2),
        "voyage_days_proxy": round(float(row["voyage_days_proxy"]), 2),
        "fuel_cost_usd_t_proxy": round(float(row["fuel_cost_usd_t_proxy"]), 2),
        "vessel_opex_usd_t_proxy": round(float(row["vessel_opex_usd_t_proxy"]), 2),
        "decision": decision,
    }

    if cargo_quantity_t is not None:
        quantity = float(cargo_quantity_t)
        if quantity <= 0:
            raise ValueError("cargo_quantity_t must be greater than zero.")
        result["cargo_quantity_t"] = quantity
        result["current_total_freight_usd"] = round(current * quantity, 2)
        result["plus_1_total_freight_usd"] = round(month_1 * quantity, 2)
        result["plus_2_total_freight_usd"] = round(month_2 * quantity, 2)

    return result


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


# Serve the existing frontend explicitly from absolute paths. This avoids
# Flask static-folder/path-resolution ambiguity on Render.
FRONTEND_DIR = os.path.dirname(BASE_DIR)
PUBLIC_DIR = os.path.join(FRONTEND_DIR, "public")
MODELS_DIR = os.path.join(PUBLIC_DIR, "models")


def _frontend_file(name):
    path = os.path.join(FRONTEND_DIR, name)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Frontend file not found: {path}")
    return path


@app.get("/")
def root():
    return send_file(_frontend_file("index.html"), mimetype="text/html")


@app.get("/app.js")
def frontend_app():
    return send_file(_frontend_file("app.js"), mimetype="application/javascript")


@app.get("/style.css")
def frontend_style():
    return send_file(_frontend_file("style.css"), mimetype="text/css")


@app.get("/geography.css")
def frontend_geography_style():
    return send_file(_frontend_file("geography.css"), mimetype="text/css")


@app.get("/maritime-routes.json")
def frontend_routes():
    path = os.path.join(PUBLIC_DIR, "maritime-routes.json")
    if not os.path.isfile(path):
        path = os.path.join(FRONTEND_DIR, "maritime-routes.json")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Route data not found: {path}")
    return send_file(path, mimetype="application/json")


@app.get("/models/<path:filename>")
def frontend_model(filename):
    safe_name = os.path.basename(filename)
    path = os.path.join(MODELS_DIR, safe_name)
    if not os.path.isfile(path):
        return jsonify({"error": "Model file not found"}), 404
    return send_file(path, conditional=True)


@app.get("/api/freight-prediction/health")
def health():
    _, _, _, latest_date = initialize()
    frontend_files = {}
    for name in ("index.html", "app.js", "style.css", "geography.css"):
        path = os.path.join(FRONTEND_DIR, name)
        frontend_files[name] = os.path.getsize(path) if os.path.isfile(path) else None
    return jsonify({
        "status": "ok",
        "latest_data_month": latest_date.strftime("%Y-%m"),
        "frontend_files": frontend_files,
    })


@app.post("/api/freight-prediction")
def freight_prediction():
    try:
        data = request.get_json(silent=True) or {}
        origin, destination, cargo, vessel = normalize_inputs(data)
        quantity = data.get("cargo_quantity_t")
        result = predict_freight(
            origin,
            destination,
            cargo,
            vessel,
            quantity,
        )
        return jsonify(result)
    except ValueError as exc:
        app.logger.warning("Freight prediction validation error. Payload=%r Error=%s", data, exc)
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Freight prediction failed")
        return jsonify({"error": "Freight prediction failed", "details": str(exc)}), 500


if __name__ == "__main__":
    # Startup training happens once and is cached for subsequent requests.
    initialize()
    print("Freight prediction service ready.")
    print("Latest data month: March 2026")
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5002")), debug=False)
