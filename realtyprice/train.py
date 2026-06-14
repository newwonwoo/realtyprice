from __future__ import annotations

import argparse

from realtyprice.model import train_model


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the RealtyPrice apartment price model.")
    parser.add_argument("--data", default="data/sample_apartments.csv", help="Path to training CSV data.")
    parser.add_argument("--model-path", default="models/price_model.json", help="Where to write the trained model.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    report = train_model(args.data, args.model_path)
    print(f"Trained on {report.rows} rows")
    print(f"MAE: {report.mean_absolute_error:.2f}")
    print(f"R2: {report.r2:.3f}")
    print(f"Saved model: {report.model_path}")


if __name__ == "__main__":
    main()
