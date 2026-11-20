"""Cài đặt › Nhắc nhở E2E (issue #20, TC-E2E-18) on the mock backend (ADR-016).

REM-01 ("Để sau" after Onboarding) runs in test_onboarding.py, where the onboarding happens. This
file uses its own account with a profile. The APK is reinstalled for every run (conftest), so the
notification permission starts unanswered. Tests run in order and share state.

Whether a notification actually arrives (REM-02, 03, 05, 06, 08) needs waiting on a real device:
TC-DEV-02.
"""

import datetime

import pytest
from appium.webdriver.common.appiumby import AppiumBy

from conftest import create_user_with_profile, restart_app
from test_auth import by_id, go_to_login, type_into
from test_onboarding import by_text, present, sign_out_from_tabs, wait_until

EMAIL = "e2e-reminders@example.com"
PASSWORD = "e2e-password-1"

# The system permission dialog (Android 13+). Text fallbacks cover ROMs with their own dialog.
ALLOW_IDS = ("com.android.permissioncontroller:id/permission_allow_button",)
DENY_IDS = ("com.android.permissioncontroller:id/permission_deny_button",)
ALLOW_TEXT = "(allow|cho phép)"
DENY_TEXT = "(don.t allow|không cho phép|từ chối)"


@pytest.fixture(scope="module", autouse=True)
def reminders_account(driver):
    create_user_with_profile(
        EMAIL,
        PASSWORD,
        {
            "weight_kg": 70,
            "height_cm": 175,
            "sex": "male",
            "birth_year": datetime.date.today().year - 30,
            "activity_level": "moderate",
            "goal_type": "lose",
        },
    )
    yield
    # Leave no schedule on the test phone and hand Đăng nhập to the next file.
    driver.implicitly_wait(0)
    try:
        on_reminders = bool(driver.find_elements(AppiumBy.ID, "reminder-switch"))
        signed_out = bool(driver.find_elements(AppiumBy.ID, "screen-login"))
    finally:
        driver.implicitly_wait(10)
    if on_reminders and switch_on(driver):
        by_id(driver, "reminder-switch").click()
        wait_until(driver, lambda d: not switch_on(d))
    if not signed_out:
        # The Cài đặt tab keeps its stack, so leave Nhắc nhở before signing out from Cài đặt.
        if on_reminders:
            by_id(driver, "screen-settings-reminders-back").click()
        sign_out_from_tabs(driver)


def open_reminders(driver):
    if not driver.find_elements(AppiumBy.XPATH, '//*[starts-with(@resource-id, "screen-")]') or (
        driver.find_elements(AppiumBy.ID, "screen-login")
    ):
        go_to_login(driver)
        type_into(driver, "login-email", EMAIL)
        type_into(driver, "login-password", PASSWORD)
        by_id(driver, "login-submit").click()
        assert by_id(driver, "screen-today").is_displayed()
    by_text(driver, "Cài đặt").click()
    by_id(driver, "settings-reminders").click()
    assert by_id(driver, "screen-settings-reminders").is_displayed()


def switch_on(driver) -> bool:
    return driver.find_element(AppiumBy.ID, "reminder-switch").get_attribute("checked") == "true"


def answer_permission(driver, allow: bool):
    """Taps Allow / Don't allow in the system dialog, by id first, then by its label."""
    ids, text = (ALLOW_IDS, ALLOW_TEXT) if allow else (DENY_IDS, DENY_TEXT)

    def find(d):
        for i in ids:
            found = d.find_elements(AppiumBy.ID, i)
            if found:
                return found[0]
        found = d.find_elements(
            AppiumBy.ANDROID_UIAUTOMATOR,
            f'new UiSelector().clickable(true).textMatches("(?iu)^{text}$")',
        )
        return found[0] if found else None

    wait_until(driver, find, timeout=10).click()


def test_deny_permission_keeps_switch_off(driver):
    """REM-04: switching on and saying no leaves it off, with 'Bị chặn' and 'Mở cài đặt'."""
    open_reminders(driver)
    assert not switch_on(driver)
    assert by_id(driver, "reminder-time-value").text == "20:00"

    by_id(driver, "reminder-switch").click()
    answer_permission(driver, allow=False)
    wait_until(driver, present("reminder-permission-blocked"))
    assert not switch_on(driver)
    assert "Bị chặn trong cài đặt hệ thống" in by_id(driver, "reminder-permission-blocked").text
    assert by_id(driver, "reminder-open-settings").is_displayed()


def test_allow_change_time_survives_restart(driver, config):
    """REM-07 (one device): switched on with permission and moved to 21:00, both survive a restart."""
    open_reminders(driver)
    by_id(driver, "reminder-switch").click()
    # Android 13+ asks a second time after one "no".
    answer_permission(driver, allow=True)
    wait_until(driver, present("reminder-permission-granted"))
    wait_until(driver, switch_on)

    by_id(driver, "reminder-time").click()
    # Material 3 clock dial (Compose): each hour has a content description such as "21 hours"
    # (in the device language, e.g. "21 giờ").
    hour = wait_until(
        driver,
        lambda d: d.find_elements(AppiumBy.ANDROID_UIAUTOMATOR, 'new UiSelector().descriptionStartsWith("21 ")'),
        timeout=10,
    )
    hour[0].click()
    by_text(driver, "^Chọn$").click()
    wait_until(driver, lambda d: d.find_element(AppiumBy.ID, "reminder-time-value").text == "21:00")
    wait_until(driver, lambda d: d.find_element(AppiumBy.ID, "reminder-switch").get_attribute("enabled") == "true")

    restart_app(driver, config["appPackage"])
    open_reminders(driver)
    assert switch_on(driver)
    assert by_id(driver, "reminder-time-value").text == "21:00"
    assert by_id(driver, "reminder-permission-granted").is_displayed()
