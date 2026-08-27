from app.evaluation.metrics import EvaluationRow, evaluate
from app.evaluation.cli import _read_rows

import pytest


def test_reports_perfect_ranking_score_and_rater_agreement() -> None:
    rows = [
        EvaluationRow("a-high", "job-a", 4, 100, 4, 4),
        EvaluationRow("a-low", "job-a", 0, 0, 0, 0),
        EvaluationRow("b-high", "job-b", 3, 75, 3, 3),
        EvaluationRow("b-low", "job-b", 1, 25, 1, 1),
    ]

    result = evaluate(rows, k=1)

    assert result["scoreMetrics"] == {
        "maeOnLabelScale0To4": 0.0,
        "spearmanCorrelation": 1.0,
    }
    assert result["rankingMetrics"] == {
        "meanNdcgAt1": 1.0,
        "meanReciprocalRankLabelAtLeast3": 1.0,
        "meanRecallAt1LabelAtLeast3": 1.0,
        "meanTop1Agreement": 1.0,
    }
    assert result["interRaterAgreement"] == {
        "pairCount": 4,
        "rawAgreement": 1.0,
        "quadraticWeightedKappa": 1.0,
    }
    assert "PAIR_COUNT_BELOW_30" in result["warnings"]


def test_spearman_detects_reversed_scores() -> None:
    result = evaluate([
        EvaluationRow("one", "job-a", 0, 100),
        EvaluationRow("two", "job-a", 1, 75),
        EvaluationRow("three", "job-a", 2, 50),
        EvaluationRow("four", "job-a", 3, 25),
    ])

    assert result["scoreMetrics"]["spearmanCorrelation"] == -1.0
    assert result["interRaterAgreement"] is None


def test_rejects_duplicate_pair_ids() -> None:
    with pytest.raises(ValueError, match="Duplicate pair_id"):
        evaluate([
            EvaluationRow("duplicate", "job-a", 4, 90),
            EvaluationRow("duplicate", "job-b", 2, 50),
        ])


def test_reads_the_versionable_annotation_csv_shape(tmp_path) -> None:
    source = tmp_path / "annotations.csv"
    source.write_text(
        "pair_id,job_id,rater_1_label,rater_2_label,adjudicated_label,predicted_score\n"
        "pair-1,job-1,4,3,4,87.5\n",
        encoding="utf-8",
    )

    assert _read_rows(source) == [EvaluationRow("pair-1", "job-1", 4, 87.5, 4, 3)]
