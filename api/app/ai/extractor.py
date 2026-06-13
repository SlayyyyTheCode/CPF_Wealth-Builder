import json
from typing import Protocol
from app.ai.diff import CORE_FIELDS


class ExtractionError(Exception):
    pass


class PolicyExtractor(Protocol):
    def extract(self, pdf_bytes: bytes) -> dict: ...


class FixtureExtractor:
    """Deterministic extractor for tests / no-API-key mode."""

    def extract(self, pdf_bytes: bytes) -> dict:
        return {
            "effective_year": 2027,
            "frs": 228200,
            "brs": 114100,
            "ers": 456400,
            "bhs": 81400,
            "ordinary_wage_ceiling": 8000,
            "additional_wage_ceiling": 102000,
            "cpf_life_eligibility_min": 60000,
        }


class ClaudeExtractor:
    MODEL = "claude-opus-4-8"

    def __init__(self, api_key: str):
        self._api_key = api_key

    def _client(self):
        import anthropic
        return anthropic.Anthropic(api_key=self._api_key)

    def _parse_response(self, text: str) -> dict:
        """Extract the first valid JSON object from text. Testable without network.
        Scans each '{' and uses raw_decode so nested/multi-object output is handled."""
        decoder = json.JSONDecoder()
        for i, ch in enumerate(text):
            if ch != "{":
                continue
            try:
                data, _ = decoder.raw_decode(text[i:])
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict):
                return {k: data[k] for k in CORE_FIELDS if k in data}
        raise ExtractionError("No JSON object in model response")

    def extract(self, pdf_bytes: bytes) -> dict:
        import base64
        b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")
        prompt = (
            "Extract the following CPF policy values from this document and return "
            "ONLY a JSON object with these exact keys (numbers, no text): "
            + ", ".join(CORE_FIELDS) + "."
        )
        try:
            resp = self._client().messages.create(
                model=self.MODEL,
                max_tokens=4096,
                messages=[{"role": "user", "content": [
                    {"type": "document", "source": {"type": "base64",
                        "media_type": "application/pdf", "data": b64}},
                    {"type": "text", "text": prompt},
                ]}],
            )
        except Exception as e:  # network/SDK error
            raise ExtractionError(str(e)) from e
        text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
        return self._parse_response(text)


def get_extractor(settings) -> PolicyExtractor:
    if getattr(settings, "ANTHROPIC_API_KEY", ""):
        return ClaudeExtractor(settings.ANTHROPIC_API_KEY)
    return FixtureExtractor()
