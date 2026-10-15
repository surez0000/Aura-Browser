# Test-only TLS fixture

A self-signed certificate for `127.0.0.1` / `localhost`, used by
`tests/e2e/load-errors.spec.ts` to serve a page no system trusts, so Aura
shows its certificate warning. It protects nothing; do not reuse it.

Regenerate (valid ten years):

```bash
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
  -subj "/CN=localhost/O=Aura Browser e2e (test only)" \
  -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" \
  -keyout localhost.key -out localhost.crt
```
