"""A stand-in for Supabase Auth, so the real auth code can be exercised.

    python3 tests/browser/fake-gotrue.py 5998 &
    NEXT_PUBLIC_SUPABASE_URL=http://localhost:5998 ... npx next start

WHY THIS EXISTS RATHER THAN A MOCK. The unit tests mock verifyPassword, so
they prove what the domain does with an answer — not that the answer is
obtained without trampling the caller's session. That claim is about the
@supabase/supabase-js client's real behaviour: which endpoints it calls, what
it does with the session it receives, and above all whether anything writes a
cookie. Mocking the client out is precisely mocking out the thing in question.

So this speaks GoTrue's wire protocol for the endpoints this app touches, and
the app runs unmodified against it. It is a TEST DOUBLE, not a security
boundary: every password is accepted if it matches the table below, and nothing
here is ever reachable from a real deployment, which reads its URL from
NEXT_PUBLIC_SUPABASE_URL.

It also records what it was asked, so a check can assert that the logout
following a step-up carried scope=local — the difference between revoking one
throwaway token and signing the operator out of every device they own.

── WHAT MFA ADDED, AND THE TWO PLACES IT HAD TO GET REAL ──────────────────

THE ACCESS TOKEN IS NOW AN ACTUAL JWT. It used to be "at-" plus random hex,
which was enough while nothing read it. lib/auth/mfa.ts decodes the token to
read the `aal` claim — after getUser() has validated it, which is the whole
security argument there — so a token with no payload would make the gate read
every session as aal1 and nothing would ever pass. The signature is not real
and is not checked here; what has to be real is the SHAPE, because that is what
the app parses.

TOTP IS COMPUTED, NOT WAVED THROUGH. A fake that accepted any six digits would
let the browser suite pass with an enrollment screen that verified nothing, and
the check "a wrong code is refused" would be measuring nothing at all. So this
implements RFC 6238 over the enrolled secret, from the standard library, and
the checks derive codes the same way.
"""
import base64
import hashlib
import hmac
import json
import random
import string
import struct
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# email -> password. Mutable: the password-reset flow really changes one, and a
# check that the new password works and the old one does not needs that to be
# true here rather than asserted about a no-op.
ACCOUNTS = {
    "boss@etsypilot.app": "correct-horse-battery",
    "ops@etsypilot.app": "admin-password-here",
    "seller@example.com": "seller-password-x",
    "promoted@example.com": "manager-password-y",
}

CALLS = []          # every request, for assertions
TOKENS = {}         # access_token -> {"email": ..., "aal": ...}
FACTORS = {}        # email -> [factor dict]
RECOVERY = {}       # email -> {"id": ..., "codes": [{"code":..., "used":bool}]}
RECOVERY_OTP = {}   # email -> the six digits most recently "emailed"


def user_id(email):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "etsypilot-fake-gotrue:" + email))


# ---------------------------------------------------------------- TOTP
#
# RFC 6238 with the defaults every authenticator app uses: SHA-1, 6 digits, a
# 30-second step. Kept here rather than pulled from a package so the checks and
# the server agree by construction, and so this file keeps its only-stdlib
# property.

def totp_now(secret_b32, at=None, drift=0):
    key = base64.b32decode(secret_b32 + "=" * (-len(secret_b32) % 8), casefold=True)
    counter = int((at or time.time()) // 30) + drift
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{code % 1_000_000:06d}"


def totp_accepts(secret_b32, code):
    # One step either side, which is what real servers allow for clock drift.
    return any(totp_now(secret_b32, drift=d) == code for d in (-1, 0, 1))


def new_secret():
    return "".join(random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567") for _ in range(32))


def new_recovery_code():
    body = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(10))
    return body[:5] + "-" + body[5:]


# ---------------------------------------------------------------- tokens

def b64url(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def access_token_for(email, aal):
    """A structurally real JWT. The signature is a placeholder, by design.

    lib/auth/mfa.ts reads `sub` and `aal` out of this AFTER asking /auth/v1/user
    to validate the token, which is what makes decoding it sound there. Here
    validation is the TOKENS lookup below, so the signature has nothing to do.
    """
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64url(json.dumps({
        "sub": user_id(email),
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "aal": aal,
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }).encode())
    return f"{header}.{payload}.{b64url(uuid.uuid4().bytes)}"


def factors_for(email):
    return FACTORS.setdefault(email, [])


def public_factors(email):
    """What /user publishes. NEVER the secret — that is the one field the app

    must not be able to read back, and a fake that leaked it would let a wrong
    implementation pass.
    """
    out = []
    for factor in factors_for(email):
        out.append({
            "id": factor["id"],
            "friendly_name": factor.get("friendly_name"),
            "factor_type": factor["factor_type"],
            "status": factor["status"],
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
        })
    recovery = RECOVERY.get(email)
    if recovery:
        out.append({
            "id": recovery["id"],
            "friendly_name": "Recovery codes",
            "factor_type": "recovery_code",
            "status": "verified",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
        })
    return out


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
        "factors": public_factors(email),
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
        "is_anonymous": False,
    }


def session_for(email, aal="aal1"):
    access = access_token_for(email, aal)
    TOKENS[access] = {"email": email, "aal": aal}
    now = int(time.time())
    return {
        "access_token": access,
        "token_type": "bearer",
        "expires_in": 3600,
        "expires_at": now + 3600,
        "refresh_token": "rt-" + uuid.uuid4().hex,
        "user": user_object(email),
    }


# THREADING IS NOT AN OPTIMISATION HERE — IT IS CORRECTNESS.
#
# This was a plain HTTPServer, which serves one request at a time, and that was
# fine while each page made one or two auth calls in sequence. The dashboard
# layout now resolves the session, the operator access and the MFA posture
# CONCURRENTLY, so three getUser() calls arrive at once. Against a serial
# server the later ones stall behind the first and some fail outright.
#
# The symptom was not an error. getMfaPosture() returns the closed posture when
# getUser() fails, and "closed" on the seller gate means "no factor, carry on"
# — so an enrolled account intermittently walked past the code screen, and the
# same URL gave a different answer on the next load. Half an hour was spent
# reading that as a bug in the gate. A test double that cannot serve the
# traffic the app produces manufactures its own flakiness.
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

    def _session(self):
        """The record behind this request's bearer token, or None."""
        return TOKENS.get(self._bearer())

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return {}

    # -------------------------------------------------------------- GET

    def do_GET(self):
        route = urlparse(self.path)
        CALLS.append({"method": "GET", "path": route.path, "query": route.query})

        # The check harness reads these to assert what the app actually did.
        if route.path == "/__calls":
            return self._send(200, CALLS)
        if route.path == "/__state":
            # Secrets and codes, for the CHECKS only. A browser check cannot
            # read a QR code off a screen or an email out of an inbox, so it
            # asks here — the same way it would read a test mailbox.
            return self._send(200, {
                "factors": {email: rows for email, rows in FACTORS.items()},
                "recovery": RECOVERY,
                "recovery_otp": RECOVERY_OTP,
                "accounts": ACCOUNTS,
                "tokens": {token: meta for token, meta in TOKENS.items()},
            })

        if route.path == "/auth/v1/user":
            session = self._session()
            if not session:
                return self._send(401, {"message": "invalid token", "code": 401})
            return self._send(200, user_object(session["email"]))

        if route.path == "/auth/v1/factors/recovery-codes":
            session = self._session()
            if not session:
                return self._send(401, {"message": "invalid token", "code": 401})
            record = RECOVERY.get(session["email"])
            if not record:
                return self._send(404, {"message": "no recovery codes", "code": 404})
            return self._send(200, {
                "id": record["id"],
                "type": "recovery_code",
                "total": len(record["codes"]),
                "remaining": sum(1 for c in record["codes"] if not c["used"]),
            })

        if route.path == "/auth/v1/settings":
            return self._send(200, {"external": {}, "disable_signup": False, "mailer_autoconfirm": True})

        return self._send(404, {"message": "not found"})

    # -------------------------------------------------------------- POST

    def do_POST(self):
        route = urlparse(self.path)
        query = parse_qs(route.query)
        body = self._body()

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
                    # ALWAYS aal1. Signing in with a password is aal1 even for
                    # an enrolled account — that is the entire distinction the
                    # /admin gate turns on, and a fake that handed out aal2
                    # here would make the gate untestable.
                    return self._send(200, session_for(email, "aal1"))
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
            scope = (query.get("scope") or ["global"])[0]
            token = self._bearer()
            session = TOKENS.get(token)
            if scope == "others" and session:
                # Every other session for this account, and not this one.
                for other, meta in list(TOKENS.items()):
                    if other != token and meta["email"] == session["email"]:
                        TOKENS.pop(other, None)
            elif scope == "global" and session:
                for other, meta in list(TOKENS.items()):
                    if meta["email"] == session["email"]:
                        TOKENS.pop(other, None)
            else:
                TOKENS.pop(token, None)
            return self._send(204)

        if route.path == "/auth/v1/signup":
            email = (body.get("email") or "").strip().lower()
            ACCOUNTS.setdefault(email, body.get("password") or "")
            return self._send(200, session_for(email, "aal1"))

        # ---- password reset by emailed code ------------------------------
        if route.path == "/auth/v1/recover":
            email = (body.get("email") or "").strip().lower()
            # A code is minted only for an address that exists — and the
            # RESPONSE IS 200 EITHER WAY, which is the behaviour the app's
            # enumeration property leans on. A fake that 404'd for an unknown
            # address would hide a leak rather than expose one.
            if email in ACCOUNTS:
                RECOVERY_OTP[email] = f"{random.randrange(1_000_000):06d}"
            return self._send(200, {})

        if route.path == "/auth/v1/verify":
            email = (body.get("email") or "").strip().lower()
            token = (body.get("token") or "").strip()
            kind = body.get("type") or ""
            if kind != "recovery":
                return self._send(400, {"message": "unsupported otp type", "code": 400})
            expected = RECOVERY_OTP.get(email)
            if not expected or token != expected:
                return self._send(403, {
                    "error": "invalid_grant",
                    "message": "Token has expired or is invalid",
                    "code": "otp_expired",
                })
            # Single use, at the provider. Nothing in the app tracks this.
            RECOVERY_OTP.pop(email, None)
            return self._send(200, session_for(email, "aal1"))

        # ---- MFA ----------------------------------------------------------
        if route.path == "/auth/v1/factors":
            session = self._session()
            if not session:
                return self._send(401, {"message": "invalid token", "code": 401})
            email = session["email"]
            friendly = body.get("friendly_name") or "Authenticator app"
            if any(f.get("friendly_name") == friendly for f in factors_for(email)):
                # GoTrue's real behaviour, and the reason beginEnrollment()
                # clears abandoned stubs before asking for a new one.
                return self._send(422, {
                    "message": "A factor with the friendly name already exists",
                    "code": "mfa_factor_name_conflict",
                })
            secret = new_secret()
            factor = {
                "id": str(uuid.uuid4()),
                "factor_type": body.get("factor_type") or "totp",
                "status": "unverified",
                "friendly_name": friendly,
                "secret": secret,
            }
            factors_for(email).append(factor)
            label = f"EtsyPilot:{email}"
            return self._send(200, {
                "id": factor["id"],
                "type": "totp",
                "friendly_name": friendly,
                "totp": {
                    # A real data URI so the <img> renders; the picture is a
                    # placeholder because nothing in a check reads pixels.
                    "qr_code": "data:image/svg+xml;utf-8,"
                               "%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20"
                               "width%3D%22160%22%20height%3D%22160%22%3E%3Crect%20width"
                               "%3D%22160%22%20height%3D%22160%22%20fill%3D%22%23fff%22/%3E%3C/svg%3E",
                    "secret": secret,
                    "uri": f"otpauth://totp/{label}?secret={secret}&issuer=EtsyPilot",
                },
            })

        parts = route.path.strip("/").split("/")
        # /auth/v1/factors/<id>/challenge  and  /auth/v1/factors/<id>/verify
        if len(parts) == 5 and parts[:3] == ["auth", "v1", "factors"]:
            session = self._session()
            if not session:
                return self._send(401, {"message": "invalid token", "code": 401})
            email = session["email"]
            factor_id, verb = parts[3], parts[4]

            if factor_id == "recovery-codes":
                return self._recovery_post(verb, session, body)

            factor = next((f for f in factors_for(email) if f["id"] == factor_id), None)
            if not factor:
                return self._send(404, {"message": "factor not found", "code": 404})

            if verb == "challenge":
                return self._send(200, {
                    "id": str(uuid.uuid4()),
                    "type": "totp",
                    "expires_at": int(time.time()) + 300,
                })

            if verb == "verify":
                code = (body.get("code") or "").strip()
                if not totp_accepts(factor["secret"], code):
                    return self._send(422, {
                        "message": "Invalid TOTP code entered",
                        "code": "mfa_verification_failed",
                    })
                factor["status"] = "verified"
                # A VERIFIED FACTOR MINTS AN aal2 SESSION. This is the step the
                # whole feature turns on, and the app writes the new token back
                # into its cookie jar.
                return self._send(200, session_for(email, "aal2"))

        if route.path == "/auth/v1/factors/recovery-codes":
            session = self._session()
            if not session:
                return self._send(401, {"message": "invalid token", "code": 401})
            return self._recovery_post("generate", session, body)

        return self._send(404, {"message": "not found"})

    def _recovery_post(self, verb, session, body):
        email = session["email"]

        if verb in ("generate", "regenerate"):
            codes = [new_recovery_code() for _ in range(10)]
            RECOVERY[email] = {
                "id": str(uuid.uuid4()),
                "codes": [{"code": c, "used": False} for c in codes],
            }
            return self._send(200, {
                "id": RECOVERY[email]["id"],
                "type": "recovery_code",
                "friendly_name": "Recovery codes",
                "total": len(codes),
                "codes": codes,
            })

        if verb == "verify":
            given = (body.get("code") or "").strip().lower().replace(" ", "")
            record = RECOVERY.get(email)
            if not record:
                return self._send(404, {"message": "no recovery codes", "code": 404})
            for entry in record["codes"]:
                if entry["code"].lower().replace("-", "") == given.replace("-", ""):
                    if entry["used"]:
                        # SINGLE USE, enforced here because it is enforced at
                        # the provider in production. Nothing in the app counts
                        # spent codes, which is the point of using the
                        # provider's primitive.
                        return self._send(403, {
                            "message": "Recovery code already used",
                            "code": "mfa_verification_failed",
                        })
                    entry["used"] = True
                    return self._send(200, session_for(email, "aal2"))
            return self._send(403, {
                "message": "Invalid recovery code",
                "code": "mfa_verification_failed",
            })

        return self._send(404, {"message": "not found"})

    # -------------------------------------------------------------- PUT

    def do_PUT(self):
        route = urlparse(self.path)
        body = self._body()
        CALLS.append({"method": "PUT", "path": route.path, "query": route.query,
                      "password_supplied": bool(body.get("password"))})

        if route.path == "/auth/v1/user":
            session = self._session()
            if not session:
                return self._send(401, {"message": "invalid token", "code": 401})
            password = body.get("password")
            if password is not None:
                if len(password) < 6:
                    return self._send(422, {"message": "Password is too short", "code": 422})
                ACCOUNTS[session["email"]] = password
            return self._send(200, user_object(session["email"]))

        return self._send(404, {"message": "not found"})

    # ------------------------------------------------------------ DELETE

    def do_DELETE(self):
        route = urlparse(self.path)
        CALLS.append({"method": "DELETE", "path": route.path, "query": route.query})
        session = self._session()
        if not session:
            return self._send(401, {"message": "invalid token", "code": 401})
        email = session["email"]

        if route.path == "/auth/v1/factors/recovery-codes":
            RECOVERY.pop(email, None)
            return self._send(200, {"id": "recovery-codes"})

        parts = route.path.strip("/").split("/")
        if len(parts) == 4 and parts[:3] == ["auth", "v1", "factors"]:
            factor_id = parts[3]
            FACTORS[email] = [f for f in factors_for(email) if f["id"] != factor_id]
            return self._send(200, {"id": factor_id})

        return self._send(404, {"message": "not found"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5998
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
