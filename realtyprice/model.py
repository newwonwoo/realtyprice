from __future__ import annotations

import csv
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from statistics import mean

FEATURE_COLUMNS = [
    "district",
    "building_age",
    "floor",
    "area_m2",
    "nearest_subway_m",
    "school_score",
    "transaction_year",
]
TARGET_COLUMN = "price"
NUMERIC_FEATURES = [column for column in FEATURE_COLUMNS if column != "district"]


@dataclass(frozen=True)
class TrainingReport:
    """Summary metrics returned after model training."""

    rows: int
    mean_absolute_error: float
    r2: float
    model_path: Path


@dataclass(frozen=True)
class ComparablePriceModel:
    """A compact comparable-sales estimator that can be persisted as JSON."""

    rows: list[dict[str, object]]
    numeric_ranges: dict[str, float]
    global_average_price: float

    def predict(self, features: dict[str, object]) -> float:
        if not self.rows:
            return self.global_average_price

        weighted_prices: list[tuple[float, float]] = []
        for row in self.rows:
            distance = _distance(row, features, self.numeric_ranges)
            weight = 1 / (1 + distance)
            weighted_prices.append((float(row[TARGET_COLUMN]), weight))

        total_weight = sum(weight for _, weight in weighted_prices)
        return sum(price * weight for price, weight in weighted_prices) / total_weight

    def to_dict(self) -> dict[str, object]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict[str, object]) -> "ComparablePriceModel":
        return cls(
            rows=list(payload["rows"]),
            numeric_ranges=dict(payload["numeric_ranges"]),
            global_average_price=float(payload["global_average_price"]),
        )


def validate_training_rows(rows: list[dict[str, object]]) -> None:
    """Validate that training rows include all required fields."""

    if not rows:
        raise ValueError("Training data must contain at least one row")
    missing = [column for column in [*FEATURE_COLUMNS, TARGET_COLUMN] if column not in rows[0]]
    if missing:
        raise ValueError(f"Training data is missing required columns: {', '.join(missing)}")


def read_training_csv(data_path: str | Path) -> list[dict[str, object]]:
    """Read and normalize training data from CSV."""

    with Path(data_path).open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    validate_training_rows(rows)

    normalized: list[dict[str, object]] = []
    for row in rows:
        item: dict[str, object] = {"district": str(row["district"])}
        for column in [*NUMERIC_FEATURES, TARGET_COLUMN]:
            item[column] = float(row[column])
        normalized.append(item)
    return normalized


def build_model(rows: list[dict[str, object]]) -> ComparablePriceModel:
    """Build a comparable-sales model from normalized rows."""

    ranges: dict[str, float] = {}
    for column in NUMERIC_FEATURES:
        values = [float(row[column]) for row in rows]
        ranges[column] = max(max(values) - min(values), 1.0)

    return ComparablePriceModel(
        rows=rows,
        numeric_ranges=ranges,
        global_average_price=mean(float(row[TARGET_COLUMN]) for row in rows),
    )


def train_model(data_path: str | Path, model_path: str | Path) -> TrainingReport:
    """Train and persist an apartment-price model from a CSV file."""

    rows = read_training_csv(data_path)
    model = build_model(rows)
    predictions = [_leave_one_out_prediction(rows, index) for index in range(len(rows))]
    actuals = [float(row[TARGET_COLUMN]) for row in rows]

    destination = Path(model_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(model.to_dict(), indent=2), encoding="utf-8")

    return TrainingReport(
        rows=len(rows),
        mean_absolute_error=_mean_absolute_error(actuals, predictions),
        r2=_r2_score(actuals, predictions),
        model_path=destination,
    )


def load_model(model_path: str | Path) -> ComparablePriceModel:
    """Load a persisted model."""

    path = Path(model_path)
    if not path.exists():
        raise FileNotFoundError(f"Model file not found: {path}")
    return ComparablePriceModel.from_dict(json.loads(path.read_text(encoding="utf-8")))


def predict_price(model: ComparablePriceModel, features: dict[str, object]) -> float:
    """Predict a single apartment sale price."""

    return model.predict(features)


def _distance(row: dict[str, object], features: dict[str, object], ranges: dict[str, float]) -> float:
    numeric_distance = sum(
        ((float(row[column]) - float(features[column])) / ranges[column]) ** 2
        for column in NUMERIC_FEATURES
    )
    district_penalty = 0 if row["district"] == features["district"] else 1.5
    return math.sqrt(numeric_distance) + district_penalty


def _leave_one_out_prediction(rows: list[dict[str, object]], index: int) -> float:
    training_rows = [row for row_index, row in enumerate(rows) if row_index != index]
    model = build_model(training_rows or rows)
    return model.predict(rows[index])


def _mean_absolute_error(actuals: list[float], predictions: list[float]) -> float:
    return mean(abs(actual - predicted) for actual, predicted in zip(actuals, predictions))


def _r2_score(actuals: list[float], predictions: list[float]) -> float:
    average = mean(actuals)
    total = sum((actual - average) ** 2 for actual in actuals)
    residual = sum((actual - predicted) ** 2 for actual, predicted in zip(actuals, predictions))
    return 0.0 if total == 0 else 1 - residual / total
