"""Account E2E (issue #12). Runs against the mock backend with the confirmed test account that
conftest.py creates at the start of the run (ADR-016, test-plan §3).

The driver fixture installs the app once per session, so the first test starts signed out;
every test that signs in signs out again before it ends.
"""

import time

from appium.webdriver.common.appiumby import AppiumBy

from conftest import TEST_EMAIL, TEST_PASSWORD, load_config, outbox

_config = load_config()
SIGNUP_EMAIL = "e2e-new@example.com"  # the backend is empty at the start of every run
UNKNOWN_EMAIL = "nobody-here@example.com"


def by_id(driver, test_id):
    """Find by testID, scrolling the screen until it is visible (UiAutomator2 skips off-screen
    nodes, and the auth, profile and goals forms can be taller than a phone screen)."""
    driver.implicitly_wait(0)
    try:
        if not driver.find_elements(AppiumBy.ID, test_id):
            scroll_to(driver, test_id)
    finally:
        driver.implicitly_wait(10)
    return driver.find_element(AppiumBy.ID, test_id)


def scroll_to(driver, test_id):
    """Scroll the screen's scroll view until the testID is on screen; no-op if there is none."""
    driver.find_elements(
        AppiumBy.ANDROID_UIAUTOMATOR,
        "new UiScrollable(new UiSelector().scrollable(true))"
        f'.scrollIntoView(new UiSelector().resourceId("{test_id}"))',
    )
    _wait_until_still(driver, test_id)


def _wait_until_still(driver, test_id, timeout=3.0):
    """After a scroll, wait until the element stops moving: a tap during the fling only stops the
    ScrollView and never reaches the button (seen with "Đăng xuất" at the end of onboarding)."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        found = driver.find_elements(AppiumBy.ID, test_id)
        rect = found[0].rect if found else None
        if rect is not None and rect == last:
            return
        last = rect
        time.sleep(0.3)


def type_into(driver, test_id, text):
    field = by_id(driver, test_id)
    field.clear()
    field.send_keys(text)


def go_to_login(driver):
    """From any auth screen, return to Đăng nhập. Never presses Back once the app has left the screen."""
    package = _config["appPackage"]
    for _ in range(3):
        if driver.find_elements(AppiumBy.ID, "screen-login"):
            return
        assert driver.current_package == package, f"App left the screen (on screen: {driver.current_package})"
        driver.back()
    assert by_id(driver, "screen-login").is_displayed()


def test_register_new_email_shows_check_email(driver):
    """TC-E2E-01 · ACC-01: a new email goes to 'Kiểm tra email' and does not enter the app."""
    go_to_login(driver)
    by_id(driver, "login-register").click()
    type_into(driver, "register-email", SIGNUP_EMAIL)
    type_into(driver, "register-password", "12345678")
    type_into(driver, "register-confirm", "12345678")
    by_id(driver, "register-submit").click()
    assert by_id(driver, "screen-check-email").is_displayed()
    assert [m["type"] for m in outbox(SIGNUP_EMAIL)] == ["signup"]
    by_id(driver, "check-email-login").click()


def test_register_invalid_input(driver):
    """TC-E2E-02 · ACC-02: existing email, short password and mismatched passwords are rejected."""
    go_to_login(driver)
    by_id(driver, "login-register").click()
    type_into(driver, "register-email", TEST_EMAIL)
    type_into(driver, "register-password", "1234567")
    type_into(driver, "register-confirm", "7654321")
    by_id(driver, "register-submit").click()
    assert by_id(driver, "register-password-error").is_displayed()
    assert by_id(driver, "register-confirm-error").is_displayed()
    type_into(driver, "register-password", "12345678")
    type_into(driver, "register-confirm", "12345678")
    by_id(driver, "register-submit").click()
    assert "đã được đăng ký" in by_id(driver, "register-email-error").text
    assert by_id(driver, "register-email").text == TEST_EMAIL  # typed data is kept
    driver.back()


def test_wrong_password(driver):
    """TC-E2E-03 · ACC-03: wrong password shows one generic message."""
    go_to_login(driver)
    type_into(driver, "login-email", TEST_EMAIL)
    type_into(driver, "login-password", "wrong-password")
    by_id(driver, "login-submit").click()
    assert by_id(driver, "login-error").text == "Email hoặc mật khẩu không đúng"


def test_forgot_password_same_message(driver):
    """TC-E2E-07 · ACC-09: unknown and known emails get the same confirmation."""
    messages = []
    for email in (UNKNOWN_EMAIL, TEST_EMAIL):
        # Open the screen fresh each time so the second read waits for the second response.
        go_to_login(driver)
        by_id(driver, "login-forgot").click()
        assert not driver.find_elements(AppiumBy.ID, "forgot-sent")
        type_into(driver, "forgot-email", email)
        by_id(driver, "forgot-submit").click()
        messages.append(by_id(driver, "forgot-sent").text)
        driver.back()
    assert messages[0] == messages[1]
    # Only the existing account actually gets a reset email.
    assert outbox(UNKNOWN_EMAIL) == []
    assert [m["type"] for m in outbox(TEST_EMAIL)] == ["recovery"]


def test_sign_in_then_sign_out(driver, config):
    """TC-E2E-19 · ACC-04, ACC-10: first sign-in lands on onboarding; sign-out returns to login for good."""
    go_to_login(driver)
    type_into(driver, "login-email", TEST_EMAIL)
    type_into(driver, "login-password", TEST_PASSWORD)
    by_id(driver, "login-submit").click()
    assert by_id(driver, "screen-onboarding").is_displayed()
    by_id(driver, "onboarding-signout").click()
    assert by_id(driver, "screen-login").is_displayed()
    # Back on the root screen leaves the app; reopening it must still show Đăng nhập.
    driver.back()
    driver.activate_app(config["appPackage"])
    assert by_id(driver, "screen-login").is_displayed()
    assert not driver.find_elements(AppiumBy.ID, "screen-onboarding")
