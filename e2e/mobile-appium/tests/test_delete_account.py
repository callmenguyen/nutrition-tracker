"""Cài đặt › Xoá tài khoản E2E (issue #21, TC-E2E-20) on the mock backend (ADR-016).

Own account with a profile. Cancel and a wrong password keep the account (ACC-12); the right
password deletes it, the app returns to Đăng nhập, and signing in again fails (ACC-11). The
database check with the service role runs against local Supabase in CI
(supabase/functions/delete-account/__tests__/integration.ts). Tests run in order and share state.
"""

import datetime

import pytest
from appium.webdriver.common.appiumby import AppiumBy

from conftest import create_user_with_profile
from test_auth import by_id, go_to_login, type_into
from test_onboarding import absent, by_text, hide_keyboard, present, sign_out_from_tabs, wait_until

EMAIL = "e2e-delete@example.com"
PASSWORD = "e2e-password-1"


@pytest.fixture(scope="module", autouse=True)
def delete_account(driver):
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
    # If a test stopped midway: close the dialog and hand Đăng nhập to the next file.
    driver.implicitly_wait(0)
    try:
        dialog = bool(driver.find_elements(AppiumBy.ID, "delete-account-dialog"))
        signed_out = bool(driver.find_elements(AppiumBy.ID, "screen-login"))
    finally:
        driver.implicitly_wait(10)
    if dialog:
        hide_keyboard(driver)
        by_id(driver, "delete-account-cancel").click()
    if not signed_out:
        sign_out_from_tabs(driver)


def sign_in(driver):
    go_to_login(driver)
    type_into(driver, "login-email", EMAIL)
    type_into(driver, "login-password", PASSWORD)
    by_id(driver, "login-submit").click()


def open_dialog(driver):
    if driver.find_elements(AppiumBy.ID, "screen-login"):
        sign_in(driver)
        assert by_id(driver, "screen-today").is_displayed()
    by_text(driver, "Cài đặt").click()
    by_id(driver, "settings-delete-account").click()
    wait_until(driver, present("delete-account-dialog"))
    assert "xoá vĩnh viễn" in by_text(driver, "Toàn bộ dữ liệu.*").text


def test_cancel_and_wrong_password_keep_account(driver):
    """ACC-12: Hủy and a wrong password delete nothing; the user stays signed in."""
    open_dialog(driver)
    type_into(driver, "delete-account-password", PASSWORD)
    hide_keyboard(driver)
    by_id(driver, "delete-account-cancel").click()
    wait_until(driver, absent("delete-account-dialog"))
    assert by_id(driver, "settings-email").text == EMAIL

    open_dialog(driver)
    type_into(driver, "delete-account-password", "not-the-password")
    hide_keyboard(driver)
    by_id(driver, "delete-account-confirm").click()
    error = wait_until(
        driver, lambda d: d.find_elements(AppiumBy.ID, "delete-account-password-error"), timeout=10
    )
    assert error[0].text == "Mật khẩu không đúng"
    by_id(driver, "delete-account-cancel").click()
    wait_until(driver, absent("delete-account-dialog"))
    assert by_id(driver, "settings-email").text == EMAIL


def test_right_password_deletes_account(driver):
    """ACC-11: the right password deletes the account; signing in again fails."""
    open_dialog(driver)
    type_into(driver, "delete-account-password", PASSWORD)
    hide_keyboard(driver)
    by_id(driver, "delete-account-confirm").click()
    wait_until(driver, present("screen-login"), timeout=15)

    sign_in(driver)
    assert by_id(driver, "login-error").text == "Email hoặc mật khẩu không đúng"
