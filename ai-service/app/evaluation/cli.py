from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from app.evaluation.metrics import EvaluationRow, evaluate


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compute matching and inter-rater metrics from anonymized CSV data.",
    )
    parser.add_argument("--input", type=Path, required=True, help="CSV with adjudicated labels and scores")
    parser.add_argument("--output", type=Path, help="Optional JSON output path; stdout is always written")
    parser.add_argument("--k", type=int, default=5, help="Ranking cutoff (default: 5)")
    arguments = parser.parse_args()

    result = evaluate(_read_rows(arguments.input), arguments.k)
    rendered = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True)
    print(rendered)
    if arguments.output:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(rendered + "\n", encoding="utf-8")


def _read_rows(path: Path) -> list[EvaluationRow]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {"pair_id", "job_id", "adjudicated_label", "predicted_score"}
        missing = required - set(reader.fieldnames or ())
        if missing:
            raise ValueError(f"Missing required CSV columns: {', '.join(sorted(missing))}")
        rows: list[EvaluationRow] = []
        for line_number, item in enumerate(reader, start=2):
            try:
                rows.append(EvaluationRow(
                    pair_id=(item.get("pair_id") or "").strip(),
                    job_id=(item.get("job_id") or "").strip(),
                    adjudicated_label=int(item["adjudicated_label"]),
                    predicted_score=float(item["predicted_score"]),
                    rater_1_label=_optional_label(item.get("rater_1_label")),
                    rater_2_label=_optional_label(item.get("rater_2_label")),
                ))
            except (TypeError, ValueError) as exception:
                raise ValueError(f"Invalid evaluation row at CSV line {line_number}") from exception
    return rows


def _optional_label(value: str | None) -> int | None:
    return None if value is None or not value.strip() else int(value)


if __name__ == "__main__":
    main()
