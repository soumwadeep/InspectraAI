"""Translation proxy behaviour, with the upstream faked.

These never hit BHASHINI. The live contract was verified by hand once and is
recorded in app/api/translate.py; what needs protecting in CI is the proxy's own
promises — batching, caching, validation, and honest failure — and none of those
should depend on a third-party service being up.
"""
from __future__ import annotations

import asyncio

import pytest

import app.api.translate as translate_api


class FakeUpstream:
    """Stands in for _translate_upstream and records what was requested."""

    def __init__(self, mapping=None, error: Exception | None = None):
        self.mapping = mapping or {}
        self.error = error
        self.calls: list[list[str]] = []

    async def __call__(self, texts, target):
        self.calls.append(list(texts))
        if self.error:
            raise self.error
        # Mirror the upstream's habit of dropping items it cannot translate.
        return {t: self.mapping[t] for t in texts if t in self.mapping}


@pytest.fixture(autouse=True)
def clear_cache():
    translate_api._cache.clear()
    translate_api._stats["upstream_calls"] = 0
    translate_api._stats["upstream_failures"] = 0
    yield
    translate_api._cache.clear()


@pytest.fixture()
def configured(monkeypatch):
    monkeypatch.setattr(
        translate_api.settings, "bhashini_inference_api_key", "test-inference-key"
    )


def _post(client, texts, target="hi"):
    return client.post(
        "/api/translate", json={"texts": texts, "target": target}
    )


class TestBatching:
    def test_one_upstream_call_carries_every_uncached_string(self, client, configured, monkeypatch):
        fake = FakeUpstream({"Equipment": "उपकरण", "Findings": "निष्कर्ष"})
        monkeypatch.setattr(translate_api, "_translate_upstream", fake)

        body = _post(client, ["Equipment", "Findings"]).json()

        assert len(fake.calls) == 1
        assert fake.calls[0] == ["Equipment", "Findings"]
        assert body["translated"] == {"Equipment": "उपकरण", "Findings": "निष्कर्ष"}
        assert body["requested"] == 2 and body["returned"] == 2

    def test_duplicate_strings_are_sent_once(self, client, configured, monkeypatch):
        fake = FakeUpstream({"Findings": "निष्कर्ष"})
        monkeypatch.setattr(translate_api, "_translate_upstream", fake)

        _post(client, ["Findings", "Findings", "Findings"])

        assert fake.calls == [["Findings"]]

    def test_blank_strings_are_dropped_without_an_upstream_call(self, client, configured, monkeypatch):
        fake = FakeUpstream()
        monkeypatch.setattr(translate_api, "_translate_upstream", fake)

        body = _post(client, ["   ", ""]).json()

        assert fake.calls == []
        assert body["translated"] == {}
        assert body["returned"] == 0


class TestCaching:
    def test_a_second_request_is_served_without_touching_upstream(self, client, configured, monkeypatch):
        fake = FakeUpstream({"Sensor offline": "सेंसर ऑफ़लाइन"})
        monkeypatch.setattr(translate_api, "_translate_upstream", fake)

        _post(client, ["Sensor offline"])
        second = _post(client, ["Sensor offline"]).json()

        assert len(fake.calls) == 1, "cache miss on the repeat request"
        assert second["from_cache"] == 1
        assert second["translated"] == {"Sensor offline": "सेंसर ऑफ़लाइन"}

    def test_caches_are_kept_per_target_language(self, client, configured, monkeypatch):
        fake = FakeUpstream({"Equipment": "उपकरण"})
        monkeypatch.setattr(translate_api, "_translate_upstream", fake)

        _post(client, ["Equipment"], target="hi")
        _post(client, ["Equipment"], target="ta")

        assert len(fake.calls) == 2, "a Hindi cache was served for a Tamil request"

    def test_the_cache_is_bounded(self):
        translate_api._cache.clear()
        for i in range(translate_api.CACHE_MAX_ENTRIES + 500):
            translate_api._remember("hi", f"text {i}", f"t{i}")
        assert len(translate_api._cache) <= translate_api.CACHE_MAX_ENTRIES


class TestValidation:
    def test_an_unsupported_target_language_is_rejected(self, client, configured):
        assert _post(client, ["x"], target="de").status_code == 422

    def test_an_over_long_string_is_a_400_not_a_silent_truncation(self, client, configured):
        response = _post(client, ["a" * (translate_api.MAX_CHARS_PER_TEXT + 1)])
        assert response.status_code == 400
        assert "limit" in response.json()["detail"].lower()

    def test_the_endpoint_never_requires_the_key_to_be_echoed(self, client, configured):
        response = _post(client, ["nope"], target="hi")
        assert "test-inference-key" not in response.text


class TestFailureModes:
    def test_missing_configuration_is_503_and_names_the_variable(self, client, monkeypatch):
        monkeypatch.setattr(translate_api.settings, "bhashini_inference_api_key", None)

        response = _post(client, ["Equipment"])

        assert response.status_code == 503
        assert "BHASHINI_INFERENCE_API_KEY" in response.json()["detail"]

    def test_an_upstream_network_error_becomes_a_502(self, configured, monkeypatch):
        """Exercises the real _translate_upstream, not a stand-in: the mapping
        from httpx failure to HTTPException lives inside that function, so
        faking the function out would test nothing about its error handling."""
        import httpx

        class ExplodingClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            async def post(self, *args, **kwargs):
                raise httpx.ConnectError("upstream unreachable")

        monkeypatch.setattr(translate_api.httpx, "AsyncClient", ExplodingClient)

        with pytest.raises(translate_api.HTTPException) as raised:
            asyncio.run(translate_api._translate_upstream(["Equipment"], "hi"))

        assert raised.value.status_code == 502
        assert translate_api._stats["upstream_failures"] == 1

    def test_an_upstream_non_200_becomes_a_502_without_leaking_the_body(self, configured, monkeypatch):
        import httpx

        class Responding:
            status_code = 500
            text = "Traceback ... Authorization: secret"

            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            async def post(self, *args, **kwargs):
                return self

        monkeypatch.setattr(translate_api.httpx, "AsyncClient", Responding)

        with pytest.raises(translate_api.HTTPException) as raised:
            asyncio.run(translate_api._translate_upstream(["Equipment"], "hi"))

        assert raised.value.status_code == 502
        assert "secret" not in str(raised.value.detail)

    def test_a_partially_translated_batch_returns_what_it_got(self, client, configured, monkeypatch):
        # Only one of two strings comes back; the other must be absent rather
        # than mapped to an empty string, so the UI keeps its English source.
        monkeypatch.setattr(
            translate_api, "_translate_upstream", FakeUpstream({"Findings": "निष्कर्ष"})
        )

        body = _post(client, ["Findings", "Unknown Thing"]).json()

        assert body["returned"] == 1
        assert "Unknown Thing" not in body["translated"]


class TestLanguagesDiscovery:
    def test_reports_configured_state_and_targets(self, client, configured):
        body = client.get("/api/translate/languages").json()

        assert body["configured"] is True
        assert body["source_language"] == "en"
        assert "hi" in body["targets"]

    def test_the_switcher_can_hide_itself_when_unconfigured(self, client, monkeypatch):
        monkeypatch.setattr(translate_api.settings, "bhashini_inference_api_key", None)

        assert client.get("/api/translate/languages").json()["configured"] is False
