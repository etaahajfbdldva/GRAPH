import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from analyzer import analyze_trend, format_price


def points(values):
    return [{"price_cents": value} for value in values]


class AnalyzerTests(unittest.TestCase):
    def test_insufficient_data(self):
        result = analyze_trend(points([50, 51, 52]))
        self.assertEqual(result["signal"], "NO CLEAR SIGNAL")

    def test_higher(self):
        result = analyze_trend(points([40, 40.2, 40.5, 41, 41.5, 42, 42.5, 43]))
        self.assertEqual(result["signal"], "HIGHER")

    def test_lower(self):
        result = analyze_trend(points([60, 59.8, 59.5, 59, 58.5, 58, 57.5, 57]))
        self.assertEqual(result["signal"], "LOWER")

    def test_mixed(self):
        result = analyze_trend(points([50, 51, 49.5, 50.1, 49.9]))
        self.assertEqual(result["signal"], "NO CLEAR SIGNAL")

    def test_price_format(self):
        self.assertEqual(format_price(0.425), "42.5¢")
        self.assertEqual(format_price(None), "—")


if __name__ == "__main__":
    unittest.main()
