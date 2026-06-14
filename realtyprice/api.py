from __future__ import annotations

import json
import os
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from realtyprice.model import FEATURE_COLUMNS, load_model, predict_price

DEFAULT_MODEL_PATH = Path(os.getenv("REALTYPRICE_MODEL_PATH", "models/price_model.json"))


@lru_cache(maxsize=1)
def get_model():
    return load_model(DEFAULT_MODEL_PATH)


def health() -> dict[str, object]:
    return {"status": "ok", "model_available": DEFAULT_MODEL_PATH.exists()}


def predict(features: dict[str, Any]) -> dict[str, object]:
    missing = [column for column in FEATURE_COLUMNS if column not in features]
    if missing:
        raise ValueError(f"Missing required feature(s): {', '.join(missing)}")

    estimate = predict_price(get_model(), features)
    return {
        "estimated_price": round(estimate, 2),
        "currency_unit": "dataset_unit",
        "model_version": "local-json-comparable-sales",
    }


class RealtyPriceHandler(BaseHTTPRequestHandler):
    """Minimal JSON API handler for local serving without external dependencies."""

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        if self.path == "/health":
            self._send_json(200, health())
            return
        self._send_json(404, {"detail": "Not found"})

    def do_POST(self) -> None:  # noqa: N802 - http.server API
        if self.path != "/predict":
            self._send_json(404, {"detail": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            self._send_json(200, predict(payload))
        except FileNotFoundError:
            self._send_json(503, {"detail": "No trained model is available. Run the training command first."})
        except (ValueError, json.JSONDecodeError) as exc:
            self._send_json(400, {"detail": str(exc)})

    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run(host: str = "127.0.0.1", port: int = 8000) -> None:
    server = ThreadingHTTPServer((host, port), RealtyPriceHandler)
    print(f"Serving RealtyPrice API on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
