from pathlib import Path

VIEWER = Path(__file__).resolve().parents[2] / "viewer"


def test_viewer_consumes_published_candidate_identity_and_canonical_risk_metrics() -> None:
    script = (VIEWER / "app.js").read_text(encoding="utf-8")

    assert "selected_candidate_id" in script
    assert "candidate.candidate_id === selectedCandidateId" in script
    assert "candidate.risk_metrics?.average_risk" in script
    assert "candidate.risk_metrics?.maximum_risk" in script
