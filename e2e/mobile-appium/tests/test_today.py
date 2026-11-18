"""Tab Hôm nay E2E (issue #16). Uses its own account with a profile (Goals.md §4 example 1, so the
calorie target is 2.056 kcal) and seeds meals through the mock backend (ADR-016), because the add-meal
sheet arrives in #17.

Runs last (alphabetical order), after test_smoke left the app on Đăng nhập.
"""

import datetime

import pytest
from appium.webdriver.common.appiumby import AppiumBy

from conftest import REPORTS_DIR, create_user_with_profile, restart_app, seed_meals
from test_auth import by_id, go_to_login, type_into
from test_onboarding import by_text, sign_out_from_tabs, wait_until

EMAIL = "e2e-today@example.com"
PASSWORD = "e2e-password-1"
TODAY = datetime.date.today()  # the phone and this machine share the time zone
YESTERDAY = TODAY - datetime.timedelta(days=1)


def vi(day: datetime.date) -> str:
    return day.strftime("%d/%m/%Y")


def meal(name: str, day: datetime.date, kcal: int = 450) -> dict:
    return {
        "eaten_on": day.isoformat(),
        "name": name,
        "calories_kcal": kcal,
        "protein_g": 25,
        "sodium_mg": 1800,
        "sugar_g": 6,
    }


@pytest.fixture(scope="module", autouse=True)
def today_account():
    create_user_with_profile(
        EMAIL,
        PASSWORD,
        {
            "weight_kg": 70,
            "height_cm": 175,
            "sex": "male",
            "birth_year": TODAY.year - 30,
            "activity_level": "moderate",
            "goal_type": "lose",
        },
    )


def open_today(driver):
    """Signed in as the Hôm nay account, on the Hôm nay tab."""
    # A date picker left open by a failed test is its own window and hides the screen behind it.
    leftover = driver.find_elements(AppiumBy.ANDROID_UIAUTOMATOR, 'new UiSelector().text("Hủy")')
    if leftover:
        leftover[0].click()
    if driver.find_elements(AppiumBy.ID, "screen-today"):
        return
    go_to_login(driver)
    type_into(driver, "login-email", EMAIL)
    type_into(driver, "login-password", PASSWORD)
    by_id(driver, "login-submit").click()
    assert by_id(driver, "screen-today").is_displayed()


def restart(driver, config):
    restart_app(driver, config["appPackage"])
    assert by_id(driver, "screen-today").is_displayed()


def snapshot(driver, name: str) -> None:
    """Screenshot for the design review the issue asks for (reports/screenshots/today-*.png)."""
    folder = REPORTS_DIR / "screenshots"
    folder.mkdir(parents=True, exist_ok=True)
    driver.get_screenshot_as_file(str(folder / f"today-{name}.png"))


def meal_names(driver) -> list[str]:
    names = []
    for i in range(10):
        found = driver.find_elements(AppiumBy.ID, f"meal-row-{i}-name")
        if not found:
            break
        names.append(found[0].text)
    return names


def test_today_starts_empty_on_today(driver):
    """TC-E2E-09 · MEAL-01: the day is today; empty state; totals are 0 / target."""
    open_today(driver)
    # The date button is announced as "Chọn ngày, đang xem dd/MM/yyyy".
    assert vi(TODAY) in by_id(driver, "today-date").get_attribute("content-desc")
    assert by_id(driver, "today-empty").is_displayed()
    assert by_id(driver, "today-calories").text == "0"
    assert "2.056 kcal" in by_id(driver, "today-calories-target").text
    assert by_id(driver, "today-calories-status").text == "Còn 2.056 kcal"
    snapshot(driver, "empty")


def test_next_is_locked_and_picker_blocks_future_days(driver):
    """TC-E2E-12 · MEAL-07: '›' is disabled on today; the date picker disables days after today."""
    open_today(driver)
    assert by_id(driver, "today-next").get_attribute("enabled") == "false"
    assert not driver.find_elements(AppiumBy.ID, "today-chip-today")

    by_id(driver, "today-date").click()
    # Day cells of the shown month are the only checkable nodes, in calendar order; their text is
    # in the phone's language, so go by position. The checked cell is the viewed day (today).
    def day_cells(d):
        return d.find_elements(AppiumBy.ANDROID_UIAUTOMATOR, "new UiSelector().checkable(true)")

    wait_until(driver, lambda d: len(day_cells(d)) >= 28, timeout=10)
    cells = day_cells(driver)
    checked = [i for i, c in enumerate(cells) if c.get_attribute("checked") == "true"]
    assert checked == [TODAY.day - 1], "the picker should open on today"
    assert cells[TODAY.day - 1].get_attribute("enabled") == "true"
    assert all(c.get_attribute("enabled") == "true" for c in cells[: TODAY.day - 1])
    assert all(c.get_attribute("enabled") == "false" for c in cells[TODAY.day :])
    snapshot(driver, "picker")
    by_text(driver, "Hủy").click()
    assert by_id(driver, "screen-today").is_displayed()


def test_previous_day_shows_only_its_meals(driver):
    """MEAL-09 (display; adding through the sheet comes with #17): a meal of yesterday is listed on
    yesterday only; the Hôm nay chip returns to today."""
    seed_meals(EMAIL, [meal("Bún nạm", YESTERDAY)])
    open_today(driver)
    assert by_id(driver, "today-empty").is_displayed()

    by_id(driver, "today-prev").click()
    wait_until(driver, lambda d: meal_names(d) == ["Bún nạm"], timeout=10)
    assert vi(YESTERDAY) in by_id(driver, "today-date").get_attribute("content-desc")
    assert by_id(driver, "today-calories").text == "450"
    assert by_id(driver, "today-next").get_attribute("enabled") == "true"
    snapshot(driver, "yesterday")

    by_id(driver, "today-chip-today").click()
    assert by_id(driver, "today-empty").is_displayed()
    assert not driver.find_elements(AppiumBy.ID, "today-chip-today")


def test_order_survives_restart(driver, config):
    """TC-E2E-14 · MEAL-11 (order part; editing the first meal comes with #17): three meals keep
    their creation order after the app is closed and reopened."""
    seed_meals(EMAIL, [meal("Món 1", TODAY, 300), meal("Món 2", TODAY, 200), meal("Món 3", TODAY, 100)])
    open_today(driver)
    restart(driver, config)
    wait_until(driver, lambda d: len(meal_names(d)) == 3, timeout=10)
    assert meal_names(driver) == ["Món 1", "Món 2", "Món 3"]
    assert by_id(driver, "today-calories").text == "600"
    snapshot(driver, "three-meals")

    restart(driver, config)
    wait_until(driver, lambda d: len(meal_names(d)) == 3, timeout=10)
    assert meal_names(driver) == ["Món 1", "Món 2", "Món 3"]

    sign_out_from_tabs(driver)
