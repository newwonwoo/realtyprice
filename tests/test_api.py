from pathlib import Path

from realtyprice import api
from realtyprice.model import train_model


def test_health_reports_model_availability(tmp_path: Path, monkeypatch) -> None:
    model_path = tmp_path / "model.json"
    monkeypatch.setattr(api, "DEFAULT_MODEL_PATH", model_path)

    assert api.health() == {"status": "ok", "model_available": False}


def test_predict_returns_estimate(tmp_path: Path, monkeypatch) -> None:
    model_path = tmp_path / "model.json"
    train_model("data/sample_apartments.csv", model_path)
    monkeypatch.setattr(api, "DEFAULT_MODEL_PATH", model_path)
    api.get_model.cache_clear()

    response = api.predict(
        {
            "district": "Gangnam",
            "building_age": 10,
            "floor": 15,
            "area_m2": 84.0,
            "nearest_subway_m": 300,
            "school_score": 92,
            "transaction_year": 2026,
        }
    )

    assert response["estimated_price"] > 0
    assert response["model_version"] == "local-json-comparable-sales"
