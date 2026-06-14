from pathlib import Path

from realtyprice.model import load_model, predict_price, train_model


def test_train_model_and_predict(tmp_path: Path) -> None:
    model_path = tmp_path / "model.json"

    report = train_model("data/sample_apartments.csv", model_path)
    model = load_model(model_path)
    prediction = predict_price(
        model,
        {
            "district": "Gangnam",
            "building_age": 10,
            "floor": 15,
            "area_m2": 84.0,
            "nearest_subway_m": 300,
            "school_score": 92,
            "transaction_year": 2026,
        },
    )

    assert report.rows == 20
    assert model_path.exists()
    assert prediction > 0
