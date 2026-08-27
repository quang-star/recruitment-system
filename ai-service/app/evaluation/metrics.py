from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from math import log2, sqrt
from statistics import fmean
from typing import Iterable


@dataclass(frozen=True, slots=True)
class EvaluationRow:
    pair_id: str
    job_id: str
    adjudicated_label: int
    predicted_score: float
    rater_1_label: int | None = None
    rater_2_label: int | None = None


def evaluate(rows: Iterable[EvaluationRow], k: int = 5) -> dict[str, object]:
    values = list(rows)
    if not values:
        raise ValueError("At least one evaluated pair is required")
    if k < 1:
        raise ValueError("k must be at least 1")
    _validate(values)

    labels = [float(row.adjudicated_label) for row in values]
    predicted_labels = [row.predicted_score / 25.0 for row in values]
    grouped: dict[str, list[EvaluationRow]] = defaultdict(list)
    for row in values:
        grouped[row.job_id].append(row)

    per_job = [_ranking_metrics(job_rows, k) for job_rows in grouped.values()]
    rated = [row for row in values if row.rater_1_label is not None and row.rater_2_label is not None]
    agreement: dict[str, object] | None = None
    if rated:
        first = [int(row.rater_1_label) for row in rated]
        second = [int(row.rater_2_label) for row in rated]
        agreement = {
            "pairCount": len(rated),
            "rawAgreement": round(sum(a == b for a, b in zip(first, second)) / len(rated), 6),
            "quadraticWeightedKappa": _quadratic_weighted_kappa(first, second),
        }

    warnings: list[str] = []
    if len(values) < 30:
        warnings.append("PAIR_COUNT_BELOW_30")
    if agreement is None:
        warnings.append("SECOND_RATER_LABELS_UNAVAILABLE")
    if len(grouped) < 2:
        warnings.append("SINGLE_JOB_ONLY")

    return {
        "pairCount": len(values),
        "jobCount": len(grouped),
        "k": k,
        "labelDistribution": {
            str(label): sum(row.adjudicated_label == label for row in values)
            for label in range(5)
        },
        "scoreMetrics": {
            "maeOnLabelScale0To4": round(fmean(
                abs(predicted - actual) for predicted, actual in zip(predicted_labels, labels)
            ), 6),
            "spearmanCorrelation": _spearman(predicted_labels, labels),
        },
        "rankingMetrics": {
            f"meanNdcgAt{k}": round(fmean(item["ndcg"] for item in per_job), 6),
            "meanReciprocalRankLabelAtLeast3": round(
                fmean(item["reciprocal_rank"] for item in per_job), 6
            ),
            f"meanRecallAt{k}LabelAtLeast3": round(fmean(item["recall"] for item in per_job), 6),
            f"meanTop{k}Agreement": round(fmean(item["top_k_agreement"] for item in per_job), 6),
        },
        "interRaterAgreement": agreement,
        "warnings": warnings,
    }


def _validate(rows: list[EvaluationRow]) -> None:
    pair_ids: set[str] = set()
    for row in rows:
        if not row.pair_id.strip() or not row.job_id.strip():
            raise ValueError("pair_id and job_id must not be blank")
        if row.pair_id in pair_ids:
            raise ValueError(f"Duplicate pair_id: {row.pair_id}")
        pair_ids.add(row.pair_id)
        if not 0 <= row.adjudicated_label <= 4:
            raise ValueError(f"adjudicated_label must be between 0 and 4: {row.pair_id}")
        if not 0 <= row.predicted_score <= 100:
            raise ValueError(f"predicted_score must be between 0 and 100: {row.pair_id}")
        if (row.rater_1_label is None) != (row.rater_2_label is None):
            raise ValueError(f"Both rater labels must be supplied together: {row.pair_id}")
        for label in (row.rater_1_label, row.rater_2_label):
            if label is not None and not 0 <= label <= 4:
                raise ValueError(f"rater labels must be between 0 and 4: {row.pair_id}")


def _ranking_metrics(rows: list[EvaluationRow], k: int) -> dict[str, float]:
    predicted = sorted(rows, key=lambda row: (-row.predicted_score, row.pair_id))
    ideal = sorted(rows, key=lambda row: (-row.adjudicated_label, row.pair_id))
    effective_k = min(k, len(rows))
    ideal_dcg = _dcg(ideal[:effective_k])
    ndcg = _dcg(predicted[:effective_k]) / ideal_dcg if ideal_dcg else 0.0

    relevant = {row.pair_id for row in rows if row.adjudicated_label >= 3}
    first_relevant = next((index for index, row in enumerate(predicted, start=1)
                           if row.pair_id in relevant), None)
    reciprocal_rank = 1.0 / first_relevant if first_relevant is not None else 0.0
    retrieved = {row.pair_id for row in predicted[:effective_k]}
    recall = len(relevant & retrieved) / len(relevant) if relevant else 0.0
    ideal_top = {row.pair_id for row in ideal[:effective_k]}
    top_k_agreement = len(retrieved & ideal_top) / effective_k
    return {
        "ndcg": ndcg,
        "reciprocal_rank": reciprocal_rank,
        "recall": recall,
        "top_k_agreement": top_k_agreement,
    }


def _dcg(rows: list[EvaluationRow]) -> float:
    return sum((2 ** row.adjudicated_label - 1) / log2(index + 2)
               for index, row in enumerate(rows))


def _spearman(first: list[float], second: list[float]) -> float | None:
    first_ranks = _average_ranks(first)
    second_ranks = _average_ranks(second)
    first_mean = fmean(first_ranks)
    second_mean = fmean(second_ranks)
    numerator = sum((a - first_mean) * (b - second_mean)
                    for a, b in zip(first_ranks, second_ranks))
    first_variance = sum((value - first_mean) ** 2 for value in first_ranks)
    second_variance = sum((value - second_mean) ** 2 for value in second_ranks)
    denominator = sqrt(first_variance * second_variance)
    return round(numerator / denominator, 6) if denominator else None


def _average_ranks(values: list[float]) -> list[float]:
    ordered = sorted(enumerate(values), key=lambda item: item[1])
    ranks = [0.0] * len(values)
    start = 0
    while start < len(ordered):
        end = start + 1
        while end < len(ordered) and ordered[end][1] == ordered[start][1]:
            end += 1
        average_rank = (start + 1 + end) / 2
        for original_index, _ in ordered[start:end]:
            ranks[original_index] = average_rank
        start = end
    return ranks


def _quadratic_weighted_kappa(first: list[int], second: list[int]) -> float | None:
    size = len(first)
    first_counts = Counter(first)
    second_counts = Counter(second)
    observed = sum((a - b) ** 2 for a, b in zip(first, second)) / (size * 16)
    expected = sum(
        first_counts[a] * second_counts[b] * (a - b) ** 2
        for a in range(5) for b in range(5)
    ) / (size * size * 16)
    if expected == 0:
        return 1.0 if observed == 0 else None
    return round(1 - observed / expected, 6)
