import sys
from types import SimpleNamespace

import pytest

from app.evaluation.semantic import (MODEL_ID, MODEL_REVISION, blend, cv_text,
                                    embed_documents, jd_text, load_embedding_model)


def test_hybrid_is_bounded_and_missing_text_does_not_reduce_baseline():
    assert blend(80, 50) == 74
    assert blend(80, None) == 80
    assert blend(0, 100) == 20
    with pytest.raises(ValueError):
        blend(50, float("nan"))


def test_semantic_inputs_exclude_contact_and_unverified_skill_assertions():
    text = cv_text({"contact": {"email": "private@example.test"},
                    "skills": [{"raw": "Java", "provenance": "EXTRACTED"},
                               {"raw": "Python", "provenance": "USER_ASSERTED"}],
                    "experiences": [{"companyRedacted": "Private Company", "titleRaw": "Backend",
                                     "responsibilities": ["Maintain services"]}]})
    assert text == "Java\nBackend\nMaintain services"
    assert jd_text({"title": {"raw": "Engineer"}, "requirements": {
        "requiredSkills": [{"raw": "Java"}]}}) == "Engineer\nJava"


def test_embedding_uses_all_token_windows_and_handles_empty_document():
    np = pytest.importorskip("numpy")

    class Tokenizer:
        def num_special_tokens_to_add(self, pair):
            return 2

        def encode(self, text, add_special_tokens, verbose):
            return text.split()

        def decode(self, tokens, skip_special_tokens):
            return " ".join(tokens)

    class Model:
        max_seq_length = 4
        tokenizer = Tokenizer()
        seen = []

        def encode(self, chunks, **kwargs):
            self.seen.extend(chunks)
            return np.array([[1., 0.] if "java" in chunk else [0., 1.] for chunk in chunks])

    model = Model()
    vectors, counts = embed_documents(model, ["java backend python data cloud", ""])
    assert model.seen == ["java backend", "python data", "cloud"]
    assert counts == [3, 0]
    assert vectors[1] is None
    assert np.linalg.norm(vectors[0]) == pytest.approx(1.)
    assert vectors[0][1] > vectors[0][0]


def test_local_model_passes_pinned_snapshot_path_to_tokenizer_loader(tmp_path, monkeypatch):
    calls = []
    snapshot = str(tmp_path / "pinned-snapshot")

    def resolve(model_id, **kwargs):
        assert model_id == MODEL_ID
        assert kwargs == {"revision": MODEL_REVISION, "cache_dir": str(tmp_path),
                          "local_files_only": True, "token": False}
        return snapshot

    class Model:
        def __init__(self, path, **kwargs):
            calls.append((path, kwargs))

        def eval(self):
            calls.append("eval")

    monkeypatch.setitem(sys.modules, "huggingface_hub", SimpleNamespace(snapshot_download=resolve))
    monkeypatch.setitem(sys.modules, "sentence_transformers", SimpleNamespace(SentenceTransformer=Model))
    load_embedding_model(tmp_path, local_only=True)
    assert calls[0][0] == snapshot
    assert calls[0][1]["local_files_only"] is True
    assert calls[0][1]["token"] is False
    assert calls[1] == "eval"
