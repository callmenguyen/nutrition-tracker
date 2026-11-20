"""Shared Appium fixtures for the mobile E2E suite (ADR-012, docs/testing/test-plan.md).

- Reads the device config from config.json (gitignored; copy config.example.json).
- E2E runs against the in-memory mock backend (ADR-016) that run-test.sh starts: the run begins by
  resetting it and creating the confirmed test account (TEST_EMAIL, no profile yet).
- Creates one UiAutomator2 session per test session.
- Before every test, brings the app under test to the foreground and fails fast if it is not there,
  so a test never runs against another app.
- On a failed test, saves a screenshot, the UI page source and the app's logcat into reports/.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pytest
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait

E2E_DIR = Path(__file__).resolve().parent
REPO_ROOT = E2E_DIR.parent.parent
CONFIG_PATH = Path(os.environ.get("E2E_CONFIG", E2E_DIR / "config.json"))
REPORTS_DIR = Path(os.environ.get("E2E_REPORTS_DIR", REPO_ROOT / "reports"))
STARTUP_TIMEOUT = 90  # seconds for the first screen after install (bundle download included)
MOCK_URL = os.environ.get("E2E_MOCK_URL", "http://127.0.0.1:54399")
# Created fresh in the mock backend for every run: confirmed email, no profile yet.
TEST_EMAIL = "e2e-user@example.com"
TEST_PASSWORD = "e2e-password-1"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        pytest.exit(
            f"Missing {CONFIG_PATH}. Copy config.example.json to config.json and set the device UDID.",
            returncode=2,
        )
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    for key in ("udid", "appiumServer", "apkPath", "appPackage"):
        if not config.get(key):
            pytest.exit(f"config.json is missing '{key}'.", returncode=2)
    return config


@pytest.fixture(scope="session")
def config() -> dict:
    return load_config()


def mock_api(method: str, path: str, payload: dict | None = None):
    """Calls the mock backend's /__test endpoints; returns the JSON body, or None when empty."""
    return _request(method, f"{MOCK_URL}/__test{path}", payload)


def _request(method: str, url: str, payload=None, headers: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})}
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        body = response.read()
    return json.loads(body) if body else None


def create_user_with_profile(email: str, password: str, profile: dict) -> None:
    """A confirmed account that already has a profile, so sign-in lands on Hôm nay.

    The profile goes through the mock's PostgREST route with the user's own token, like the app.
    """
    mock_api("POST", "/users", {"email": email, "password": password})
    session = _request(
        "POST", f"{MOCK_URL}/auth/v1/token?grant_type=password", {"email": email, "password": password}
    )
    _request(
        "POST",
        f"{MOCK_URL}/rest/v1/profiles?on_conflict=user_id",
        profile,
        {"Authorization": f"Bearer {session['access_token']}", "Prefer": "resolution=merge-duplicates"},
    )


def seed_meals(email: str, entries: list[dict]) -> None:
    """Adds logged meals for a user in this order (created_at increases), bypassing the UI."""
    mock_api("POST", "/meal_entries", {"email": email, "entries": entries})


def saved_foods(email: str) -> list[dict]:
    """The user's saved foods in the mock (checks MEAL-05/06 before the Món đã lưu screen exists)."""
    return mock_api("GET", f"/foods?email={urllib.parse.quote(email)}")


def fault(path: str, mode: str = "drop") -> None:
    """Breaks the next request to `path`: "drop" writes nothing, "drop-after" writes then hangs up."""
    mock_api("POST", "/fault", {"path": path, "mode": mode})


def outbox(email: str) -> list[dict]:
    """Emails the mock backend "sent" to this address: [{"type": "signup"|"recovery", "link": ...}]."""
    return mock_api("GET", f"/outbox?email={urllib.parse.quote(email)}")


@pytest.fixture(scope="session", autouse=True)
def mock_backend():
    """Every run starts from an empty backend with one confirmed test account."""
    try:
        mock_api("POST", "/reset")
        mock_api("POST", "/users", {"email": TEST_EMAIL, "password": TEST_PASSWORD})
    except urllib.error.HTTPError as exc:  # reachable, but not the mock this suite expects
        pytest.exit(
            f"Mock backend at {MOCK_URL} answered {exc.code} on {exc.url}. Stop the old mock and rerun run-test.sh.",
            returncode=2,
        )
    except (urllib.error.URLError, OSError) as exc:
        pytest.exit(
            f"Mock backend at {MOCK_URL} is not reachable ({exc}). Run E2E through run-test.sh (ADR-016).",
            returncode=2,
        )


def restart_app(driver, package: str) -> None:
    """Close and reopen the app, then wait for its first screen (testID screen-*). A cold start
    downloads the JS bundle from Metro again (over Wi-Fi when adb is wireless), which can take
    longer than the 10 s implicit wait, especially since Skia and victory-native joined (#19)."""
    driver.terminate_app(package)
    driver.activate_app(package)
    WebDriverWait(driver, STARTUP_TIMEOUT, poll_frequency=1).until(
        lambda d: d.find_elements(AppiumBy.XPATH, '//*[starts-with(@resource-id, "screen-")]')
    )


@pytest.fixture(scope="session")
def driver(config: dict):
    apk = Path(config["apkPath"])
    if not apk.is_absolute():
        apk = REPO_ROOT / apk

    options = UiAutomator2Options()
    options.udid = config["udid"]
    options.app = str(apk)
    options.app_package = config["appPackage"]
    # Always reinstall: every debug build is versionName 0.0.0, so Appium would otherwise keep an
    # older APK whose native modules (e.g. Skia, #19) no longer match the JS from Metro.
    options.enforce_app_install = True
    options.auto_grant_permissions = False  # permission dialogs are part of the flows under test
    options.new_command_timeout = 120

    session = webdriver.Remote(config["appiumServer"], options=options)
    # React Native sets testID as a bare resource-id ("screen-login"); without this, UiAutomator2
    # rewrites AppiumBy.ID lookups to "<appPackage>:id/screen-login" and never finds them.
    session.update_settings({"disableIdLocatorAutocompletion": True})
    # Cold start: the debug APK downloads the JS bundle from Metro (over Wi-Fi when adb is wireless),
    # which can take longer than the implicit wait. Wait once for the first app screen (testID screen-*).
    WebDriverWait(session, STARTUP_TIMEOUT, poll_frequency=1).until(
        lambda d: d.find_elements(AppiumBy.XPATH, '//*[starts-with(@resource-id, "screen-")]')
    )
    session.implicitly_wait(10)
    yield session
    session.quit()


@pytest.fixture(autouse=True)
def app_in_foreground(request, config: dict):
    """Each test starts with the app under test on screen; otherwise it fails with what is on screen."""
    if "driver" not in request.fixturenames:
        yield
        return
    session = request.getfixturevalue("driver")
    package = config["appPackage"]
    if session.current_package != package:
        session.activate_app(package)
    current = session.current_package
    if current != package:
        pytest.fail(f"App {package} is not in the foreground (on screen: {current}).")
    yield


# Logcat tags worth keeping: JS console/errors, native crashes, Expo modules (their tags are lower
# case, e.g. "expo-notifications"), broadcasts and alarms the notification scheduler relies on (#20).
# Other apps' lines are dropped.
_LOGCAT_KEEP = re.compile(
    r"ReactNativeJS|ReactNative|AndroidRuntime|Expo|expo-|Hermes|FATAL|nutritiontracker"
    r"|NotificationsService|BroadcastQueue|AlarmManager|SecurityException"
)


def _safe_name(nodeid: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", nodeid).strip("_")


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    # Fixtures can read item.rep_call to act only after a failed test.
    setattr(item, f"rep_{report.when}", report)
    if report.when not in ("setup", "call") or not report.failed:
        return
    session = item.funcargs.get("driver")
    if session is None:
        return
    name = _safe_name(item.nodeid)
    shots = REPORTS_DIR / "screenshots"
    sources = REPORTS_DIR / "page-source"
    logcat = REPORTS_DIR / "logcat"
    for folder in (shots, sources, logcat):
        folder.mkdir(parents=True, exist_ok=True)
    try:
        session.get_screenshot_as_file(str(shots / f"{name}.png"))
        (sources / f"{name}.xml").write_text(session.page_source, encoding="utf-8")
        lines = [e.get("message", "") for e in session.get_log("logcat")]
        kept = [line for line in lines if _LOGCAT_KEEP.search(line)]
        (logcat / f"{name}.txt").write_text("\n".join(kept), encoding="utf-8")
    except Exception as exc:  # the report must still be written if the session died
        print(f"[e2e] could not capture failure artifacts for {name}: {exc}")
