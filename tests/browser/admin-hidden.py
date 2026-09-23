"""Is /admin actually invisible, or only unauthorised?

Run against a production build started WITHOUT AUTH_MODE, which is demo mode —
the configuration every other check in this project uses:

    npx next start -p 3100
    python3 tests/browser/admin-hidden.py

No browser here, on purpose. Playwright answers "what does a page look like";
this asks "what does the server hand back", and the leak that prompted it was
invisible in a browser because both answers rendered the same 404.

WHY THIS FILE EXISTS. domain/admin/access.ts returns 404 rather than 403 so
that whoever probes /admin cannot learn it exists. Unit tests confirmed the
gate refused. The running server said the refusal had its own shape:

    /admin            404, 0 bytes, no content-type
    /administrators   404, 9501 bytes, text/html

Same status code, obviously different responses. One curl separated "refused"
from "never written", which is exactly the reconnaissance the 404 was chosen to
deny. The status code was never the thing worth asserting.

SCOPE, stated because the guarantee is not uniform. This runs in DEMO MODE,
where middleware refuses every /admin request by rewriting it to a path with no
route — and a rewrite produces the identical response, which is what makes
byte-comparison the right assertion here. Under AUTH_MODE=live a signed-in
non-operator is refused later, during render, and Next wraps a request-time
notFound() in a different document shell; that response carries no operator
content but is not byte-identical, and domain/admin/access.ts records why it is
left that way. Nothing below silently covers that case.

So this compares /admin against a control URL that genuinely has no route, and
requires the two responses to be the SAME response. Two things legitimately
differ per request and are normalised away:

  the CSP nonce      random per request, in both plain and RSC-escaped form.
  the path echo      the flight payload contains the requested segments. Every
                     404 echoes its own URL, and the client already knows the
                     URL it asked for, so this reveals nothing.

Anything else that differs is a signal, and the comparison fails.
"""

import os
import re
import sys
import urllib.request

BASE = os.environ.get("ADMIN_BASE_URL", "http://localhost:3100")

# Real admin routes, and controls that are not routes at all. The controls are
# chosen to match in shape: same depth, similar length, one of them a prefix of
# an admin path so a sloppy matcher cannot pass by accident.
GATED = [
    "/admin",
    "/admin/users",
    # A6's account detail screen. A DYNAMIC route, and it is here because the
    # static ones cannot stand in for it: /admin/users/[userId] resolves a
    # segment before the gate runs, so a refusal has a different code path and
    # therefore a different chance of a different shape. The id is a plausible
    # one rather than gibberish, so nothing can pass by refusing to parse it.
    "/admin/users/user_01JQXV8Z0000000000000000",
    # The read-only modules. Each is gated on its own permission key, and every
    # one of them must be as invisible in demo mode as /admin itself.
    "/admin/etsy",
    "/admin/subscriptions",
    "/admin/usage",
    "/admin/ai",
    "/admin/operations",
    "/admin/metrics",
]
CONTROLS = ["/administrators", "/admin-nonexistent/x"]

fails = []
notes = []


def check(ok, label):
    (notes if ok else fails).append(("PASS  " if ok else "FAIL  ") + label)


def fetch(path):
    request = urllib.request.Request(BASE + path)
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")


def normalise(body):
    """Strip what legitimately varies per request, and nothing else."""
    body = re.sub(r'nonce="[A-Za-z0-9+/=]+"', 'nonce="N"', body)
    body = re.sub(r'\\"nonce\\":\\"[A-Za-z0-9+/=]+\\"', r'\\"nonce\\":\\"N\\"', body)
    # "c":["","admin"] — the requested path, echoed in the flight payload.
    body = re.sub(r'\\"c\\":\[[^\]]*\]', r'\\"c\\":[PATH]', body)
    return body


if not os.environ.get("AUTH_MODE"):
    notes.append("NOTE  AUTH_MODE is unset, so this is demo mode — /admin must be closed outright")
else:
    print("This check expects demo mode. Unset AUTH_MODE and restart the server.")
    sys.exit(1)

# The control first. If the server is not up, or is serving something other than
# a 404 for a route that does not exist, every comparison below is vacuous.
control_status, control_body = fetch(CONTROLS[0])
if control_status != 404:
    print(f"ABORT: control {CONTROLS[0]} returned {control_status}, not 404. Is the server up?")
    sys.exit(1)
if len(control_body) < 1000:
    print(f"ABORT: control 404 body is {len(control_body)} bytes; expected a rendered page.")
    sys.exit(1)

reference = normalise(control_body)
check(True, f"control {CONTROLS[0]} renders a real 404 page ({len(control_body)} bytes)")

for path in GATED:
    status, body = fetch(path)
    check(status == 404, f"{path} returns 404 (got {status})")
    check(
        normalise(body) == reference,
        f"{path} is byte-identical to a route that was never written",
    )
    # Named separately so a failure says WHICH tell appeared, rather than just
    # "the bodies differ" across nine kilobytes of payload.
    check("Accounts" not in body, f"{path} leaks no operator page content")
    check("platform_role" not in body, f"{path} leaks no operator schema")

for path in CONTROLS[1:]:
    status, body = fetch(path)
    check(status == 404, f"control {path} returns 404 (got {status})")
    check(normalise(body) == reference, f"control {path} matches the reference 404")

# The seller app must be completely untouched by any of this. A gate that
# closes /admin by breaking demo mode has not solved anything.
for path, expected in (
    ("/dashboard", 200),
    ("/settings/profile", 200),
    ("/profit", 200),
    # A6 wired this page to the operator permission constants, so it now
    # imports from domain/admin. Those modules are pure, but "pure" is a claim
    # about code and this is a claim about a running demo-mode server.
    ("/settings/data-permissions", 200),
):
    status, _ = fetch(path)
    check(status == expected, f"{path} still returns {expected} in demo mode (got {status})")

print("\n".join(notes))
if fails:
    print("\n" + "\n".join(fails))
    print(f"\n{len(fails)} FAILED of {len(fails) + len(notes)}")
    sys.exit(1)
print(f"\nALL {len(notes)} ADMIN-HIDDEN CHECKS PASSED")
