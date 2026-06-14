from realtyprice.web import HOME_PAGE


def test_home_page_contains_prediction_form() -> None:
    assert "RealtyPrice Web App" in HOME_PAGE
    assert "prediction-form" in HOME_PAGE
    assert "fetch('/predict'" in HOME_PAGE
    assert "예상 매매가 계산" in HOME_PAGE
