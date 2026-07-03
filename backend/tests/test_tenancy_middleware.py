from app.middleware.tenancy import resolve_tenant_slug


def headers(**kwargs: str) -> list[tuple[bytes, bytes]]:
    return [(k.replace("_", "-").encode(), v.encode()) for k, v in kwargs.items()]


class TestResolution:
    def test_header_takes_priority(self):
        raw = headers(x_tenant_slug="apex", host="nova.proppredict.com")
        assert resolve_tenant_slug(raw) == "apex"

    def test_falls_back_to_subdomain(self):
        assert resolve_tenant_slug(headers(host="nova.proppredict.com:8000")) == "nova"

    def test_slug_is_normalized(self):
        assert resolve_tenant_slug(headers(x_tenant_slug=" Apex ")) == "apex"

    def test_no_headers_resolves_to_none(self):
        assert resolve_tenant_slug([]) is None

    def test_blank_header_ignored(self):
        raw = headers(x_tenant_slug="", host="apex.proppredict.com")
        assert resolve_tenant_slug(raw) == "apex"
