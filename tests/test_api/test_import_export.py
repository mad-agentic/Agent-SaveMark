"""Import/export endpoint tests."""


def test_import_chrome_skips_duplicate_urls(client, auth_headers):
    client.post(
        "/api/v1/items",
        json={"url": "https://example.com/already", "title": "Existing"},
        headers=auth_headers,
    )

    html = """
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><A HREF="https://example.com/already">Already In DB</A>
  <DT><A HREF="https://example.com/new">New Item</A>
  <DT><A HREF="https://example.com/new">New Item Duplicate In File</A>
</DL><p>
"""

    response = client.post(
        "/api/v1/import/chrome",
        files={"file": ("bookmarks.html", html, "text/html")},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["imported"] == 1

    list_response = client.get("/api/v1/items", headers=auth_headers)
    assert list_response.status_code == 200

    urls = [item["url"] for item in list_response.json() if item.get("url")]
    assert urls.count("https://example.com/already") == 1
    assert urls.count("https://example.com/new") == 1


def test_import_chrome_handles_malformed_html_and_unsafe_links(client, auth_headers):
    html = """
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><A HREF='https://good.example.com'>Good <b>Bookmark</b></A>
  <DT><A HREF='https://spaced.example.com/path   '>  Spaced Title  </A>
  <DT><A HREF='javascript:alert(1)'>Bad JS</A>
  <DT><A HREF='https://noclose.example.com'>No Close
</DL><p>
"""

    response = client.post(
        "/api/v1/import/chrome",
        files={"file": ("messy-bookmarks.html", html, "text/html")},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["imported"] == 3

    list_response = client.get("/api/v1/items", headers=auth_headers)
    assert list_response.status_code == 200

    urls = {item["url"] for item in list_response.json() if item.get("url")}
    assert "https://good.example.com" in urls
    assert "https://spaced.example.com/path" in urls
    assert "https://noclose.example.com" in urls
    assert "javascript:alert(1)" not in urls
