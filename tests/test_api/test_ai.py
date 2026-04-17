"""AI endpoint tests."""

import agentpocket.search as search_module


def test_chat_search_gracefully_handles_search_backend_failure(client, auth_headers, monkeypatch):
    class BrokenSearchService:
        def search(self, *args, **kwargs):
            raise RuntimeError("search backend unavailable")

    monkeypatch.setattr(search_module, "get_search_service", lambda: BrokenSearchService())

    response = client.post(
        "/api/v1/ai/chat-search",
        json={"message": "tim cac tag lien quan"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["sources"] == []
    assert "could not search your saved knowledge" in data["answer"].lower()
