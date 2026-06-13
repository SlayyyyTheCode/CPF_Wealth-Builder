import json
import pytest
from app.ai.extractor import FixtureExtractor, ClaudeExtractor, ExtractionError, get_extractor
from app.ai.diff import CORE_FIELDS

def test_fixture_extractor_returns_core_fields():
    out = FixtureExtractor().extract(b"%PDF-1.4 fake")
    assert set(CORE_FIELDS).issubset(out.keys())
    assert out["frs"] == 228200

def test_get_extractor_picks_fixture_without_key():
    class S: ANTHROPIC_API_KEY = ""
    assert isinstance(get_extractor(S()), FixtureExtractor)

def test_get_extractor_picks_claude_with_key():
    class S: ANTHROPIC_API_KEY = "sk-test"
    assert isinstance(get_extractor(S()), ClaudeExtractor)

def test_claude_parse_response_extracts_json():
    ex = ClaudeExtractor("sk-test")
    text = 'Here is the data:\n{"effective_year":2027,"frs":228200,"brs":114100,"ers":456400,"bhs":81400,"ordinary_wage_ceiling":8000,"additional_wage_ceiling":102000,"cpf_life_eligibility_min":60000}\nDone.'
    parsed = ex._parse_response(text)
    assert parsed["frs"] == 228200
    assert set(CORE_FIELDS).issubset(parsed.keys())

def test_claude_parse_response_bad_json_raises():
    ex = ClaudeExtractor("sk-test")
    with pytest.raises(ExtractionError):
        ex._parse_response("no json here")
