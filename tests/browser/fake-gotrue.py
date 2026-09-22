"""A stand-in for Supabase Auth, so the real auth code can be exercised.

    python3 tests/browser/fake-gotrue.py 5998 &
    NEXT_PUBLIC_SUPABASE_URL=http://localhost:5998 ... npx next start

WHY THIS EXISTS RATHER THAN A MOCK. The unit tests mock verifyPassword, so
they prove what the domain does with an answer — not that the answer is
obtained without trampling the caller's session. That claim is about the
@supabase/supabase-js client's real behaviour: which endpoints it calls, what
it does with the session it receives, and above all whether anything writes a
cookie. Mocking the client out is precisely mocking out the thing in question.

So this speaks GoTrue's wire protocol for the four endpoints this app touches,
and the app runs unmodified against it. It is a TEST DOUBLE, not a security
boundary: every password is accepted if it matches the fixed table below, and
nothing here is ever reachable from a real deployment, which reads its URL
from NEXT_PUBLIC_SUPABASE_URL.

It also records what it was asked, so a check can assert that the logout
following a step-up carried scope=local — the difference between revoking one
throwaway token and signing the operator out of every device they own.
"""
import json
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

# email -> password. Ids are derived so they are stable across restarts.
ACCOUNTS = {
    "boss@etsypilot.app": "correct-horse-battery",
    "ops@etsypilot.app": "admin-password-here",
    "seller@example.com": "seller-password-x",
    "promoted@example.com": "manager-password-y",
}

CALLS = []          # every request, for assertions
TOKENS = {}         # access_token -> email


def user_id(email):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "etsypilot-fake-gotrue:" + email))


def user_object(email):
    return {
        "id": user_id(email),
        "aud": "authenticated",
        "role": "authenticated",
        "email": email,
        "email_confirmed_at": "2024-01-01T00:00:00Z",
        "phone": "",
        "confirmed_at": "2024-01-01T00:00:00Z",
        "last_sign_in_at": "2024-01-01T00:00:00Z",
        "app_metadata": {"provider": "email", "providers": ["email"]},
        "user_metadata": {},
        "identities": [],
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
        "is_anonymous": False,
    }


def session_for(email):
    access = "at-" + uuid.uuid4().hex
    TOKENS[access] = email
    now = int(time.time())
    return {
        "access_token": access,
        "token_type": "bearer",
        "expires_in": 3600,
        "expires_at": now + 3600,
        "refresh_token": "rt-" + uuid.uuid4().hex,
        "user": user_object(email),
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # quiet; CALLS is the record that matters

    def _send(self, status, payload=None):
        body = b"" if payload is None else json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _bearer(self):
        header = self.headers.get("Authorization", "")
        return header[7:] if header.startswith("Bearer ") else ""

    def do_GET(self):
        route = urlparse(self.path)
        CALLS.append({"method": "GET", "path": route.path, "query": route.query})

        # The check harness reads this to assert what the app actually did.
        if route.path == "/__calls":
            return self._send(200, CALLS)

        if route.path == "/auth/v1/user":
            email = TOKENS.get(self._bearer())
            if not email:
                return self._send(401, {"message": "invalid token", "code": 401})
            return self._send(200, user_object(email))

        if route.path == "/auth/v1/settings":
            return self._send(200, {"external": {}, "disable_signup": False, "mailer_autoconfirm": True})

        return self._send(404, {"message": "not found"})

    def do_POST(self):
        route = urlparse(self.path)
        query = parse_qs(route.query)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            body = {}

        CALLS.append({
            "method": "POST",
            "path": route.path,
            "query": route.query,
            "grant_type": (query.get("grant_type") or [""])[0],
            "scope": (query.get("scope") or [""])[0],
            "email": body.get("email", ""),
            # Never the password itself. Recording one in a log a check prints
            # is the habit worth not having, even against a fake.
            "password_supplied": bool(body.get("password")),
        })

        if route.path == "/auth/v1/token":
            grant = (query.get("grant_type") or [""])[0]
            if grant == "password":
                email = (body.get("email") or "").strip().lower()
                password = body.get("password") or ""
                if ACCOUNTS.get(email) == password:
                    return self._send(200, session_for(email))
                # GoTrue's shape for a bad credential: 400, with a code.
                return self._send(400, {
                    "error": "invalid_grant",
                    "error_description": "Invalid login credentials",
                    "message": "Invalid login credentials",
                    "code": "invalid_credentials",
                })
            if grant == "refresh_token":
                return self._send(400, {"error": "invalid_grant", "message": "refresh not supported here"})
            return self._send(400, {"message": "unsupported grant"})

        if route.path == "/auth/v1/logout":
            TOKENS.pop(self._bearer(), None)
            return self._send(204)

        if route.path == "/auth/v1/signup":
            email = (body.get("email") or "").strip().lower()
            ACCOUNTS.setdefault(email, body.get("password") or "")
            return self._send(200, session_for(email))

        return self._send(404, {"message": "not found"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5998
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
