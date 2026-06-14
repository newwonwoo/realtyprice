# RealtyPrice

RealtyPrice is a lightweight apartment sale-price estimation service. It provides:

- a training pipeline for tabular apartment transaction data,
- a persisted comparable-sales model,
- a standard-library JSON prediction endpoint,
- a small sample dataset for local development, and
- automated tests for the training and API layers.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install pytest  # optional, only needed for tests
python -m realtyprice.train --data data/sample_apartments.csv --model-path models/price_model.json
python -m realtyprice.api
```

Use `GET /health` and `POST /predict` against `http://127.0.0.1:8000`.

## Dataset format

Training CSV files must include these columns:

| Column | Type | Description |
| --- | --- | --- |
| `district` | string | District or city ward. |
| `building_age` | number | Building age in years. |
| `floor` | number | Unit floor. |
| `area_m2` | number | Exclusive area in square meters. |
| `nearest_subway_m` | number | Distance to nearest subway station in meters. |
| `school_score` | number | Local school/access score, 0-100. |
| `transaction_year` | integer | Transaction year. |
| `price` | number | Sale price in the same currency unit used by your data. |

## API

### `GET /health`

Returns service status and whether a trained model is available.

### `POST /predict`

Request body:

```json
{
  "district": "Gangnam",
  "building_age": 12,
  "floor": 14,
  "area_m2": 84.5,
  "nearest_subway_m": 320,
  "school_score": 92,
  "transaction_year": 2026
}
```

Response body:

```json
{
  "estimated_price": 165432.12,
  "currency_unit": "dataset_unit",
  "model_version": "local-json-comparable-sales"
}
```

## Development

```bash
pytest
```
