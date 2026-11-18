"""Tab Biểu đồ E2E (issue #19, TC-E2E-17) on the mock backend (ADR-016).

Own account with a profile (Goals.md §4 example 1) and meals seeded on 3 of the last 7 days. The
chart is a Skia canvas that UiAutomator cannot read, so values are checked in the table view
(CHART-14), which is also how a TalkBack user reads them. Tests run in order and share state.
"""

import datetime

import pytest
from appium.webdriver.common.appiumby import AppiumBy

from conftest import REPORTS_DIR, create_user_with_profile, restart_app, seed_meals
from test_auth import by_id, go_to_login, type_into
from test_onboarding import by_text, sign_out_from_tabs, wait_until
from test_today_meals import fill, open_add_sheet, save

EMAIL = "e2e-chart@example.com"
PASSWORD = "e2e-password-1"
TODAY = datetime.date.today()  # the phone and this machine share the time zone


def ago(n: int) -> datetime.date:
    return TODAY - datetime.timedelta(days=n)


def meal(name: str, day: datetime.date, kcal: int) -> dict:
    return {
        "eaten_on": day.isoformat(),
        "name": name,
        "calories_kcal": kcal,
        "protein_g": 25,
        "sodium_mg": 1800,
        "sugar_g": 6,
    }


@pytest.fixture(scope="module", autouse=True)
def chart_account(driver):
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
    # CHART-02/03: 5 days ago, 3 days ago (two meals: 1.200 + 900) and today.
    seed_meals(
        EMAIL,
        [
            meal("Bún nạm", ago(5), 1500),
            meal("Cơm tấm", ago(3), 1200),
            meal("Chè", ago(3), 900),
            meal("Bánh mì", TODAY, 450),
        ],
    )
    yield
    # The next file (test_onboarding) starts on Đăng nhập.
    driver.implicitly_wait(0)
    try:
        if not driver.find_elements(AppiumBy.ID, "screen-login"):
            by_text(driver, "Hôm nay").click()
            sign_out_from_tabs(driver)
    finally:
        driver.implicitly_wait(10)


def snapshot(driver, name: str) -> None:
    folder = REPORTS_DIR / "screenshots"
    folder.mkdir(parents=True, exist_ok=True)
    driver.get_screenshot_as_file(str(folder / f"chart-{name}.png"))


def open_chart(driver):
    if not driver.find_elements(AppiumBy.ID, "screen-today") and not driver.find_elements(
        AppiumBy.ID, "screen-chart"
    ):
        go_to_login(driver)
        type_into(driver, "login-email", EMAIL)
        type_into(driver, "login-password", PASSWORD)
        by_id(driver, "login-submit").click()
        assert by_id(driver, "screen-today").is_displayed()
    by_text(driver, "Biểu đồ").click()
    assert by_id(driver, "screen-chart").is_displayed()


def checked(driver, test_id: str) -> bool:
    return by_id(driver, test_id).get_attribute("checked") == "true"


def scroll_to_top(driver):
    """Back to the pickers: a scroll left at the end of the 30-day table hides everything above it.
    Swipes the page down (content up) until the table toggle is on screen; UiScrollable's
    scrollToBeginning did not move this React Native ScrollView."""
    driver.implicitly_wait(0)
    try:
        for _ in range(10):
            if driver.find_elements(AppiumBy.ID, "chart-table-toggle"):
                return
            r = driver.find_element(AppiumBy.ID, "screen-chart").rect
            driver.execute_script(
                "mobile: scrollGesture",
                {
                    "left": r["x"] + 20,
                    "top": r["y"] + 200,
                    "width": r["width"] - 40,
                    "height": r["height"] - 400,
                    "direction": "up",
                    "percent": 1.0,
                },
            )
    finally:
        driver.implicitly_wait(10)


def show_table(driver):
    """Opens the table unless it is open; reads the toggle's label, since rows may be off screen."""
    scroll_to_top(driver)
    toggle = by_id(driver, "chart-table-toggle")
    if "Xem dạng bảng" in (toggle.get_attribute("content-desc") or "") + (toggle.text or ""):
        toggle.click()


def row_value(driver, i: int) -> str:
    return by_id(driver, f"chart-row-{i}-value").text


def test_table_shows_totals_and_gaps(driver):
    """TC-E2E-17 · CHART-02, CHART-03, CHART-06 (default): Calo, 7 days, bars; 3 days with totals,
    4 days 'Chưa ghi' (gaps, not 0)."""
    open_chart(driver)
    assert checked(driver, "chart-metric-calories")
    assert checked(driver, "chart-range-7")
    assert checked(driver, "chart-kind-bar")
    snapshot(driver, "7-days-bars")
    show_table(driver)
    assert [row_value(driver, i) for i in range(7)] == [
        "Chưa ghi",
        "1.500 kcal",
        "Chưa ghi",
        "2.100 kcal",
        "Chưa ghi",
        "Chưa ghi",
        "450 kcal",
    ]
    assert by_id(driver, "chart-row-1").get_attribute("content-desc") == (
        f"{ago(5).strftime('%d/%m')}, 1.500 kcal"
    )


def test_choices_remembered_after_restart(driver, config):
    """TC-E2E-17 · CHART-06: 30 days + line survive closing the app."""
    open_chart(driver)
    scroll_to_top(driver)
    by_id(driver, "chart-range-30").click()
    by_id(driver, "chart-kind-line").click()
    snapshot(driver, "30-days-line")
    restart_app(driver, config["appPackage"])
    assert by_id(driver, "screen-today").is_displayed()
    open_chart(driver)
    assert checked(driver, "chart-range-30")
    assert checked(driver, "chart-kind-line")
    show_table(driver)
    # 30 days end on today: 5 days ago is row 24, 3 days ago row 26, today row 29.
    # Read top to bottom: by_id scrolls down to a row but not back up.
    assert row_value(driver, 0) == "Chưa ghi"
    assert row_value(driver, 24) == "1.500 kcal"
    assert row_value(driver, 29) == "450 kcal"


def test_open_day_then_new_meal_updates_chart(driver):
    """TC-E2E-17 · CHART-07, CHART-03, CHART-08: a day's card opens that day on Hôm nay with the same
    total; a meal added there shows on Biểu đồ when coming back."""
    open_chart(driver)
    show_table(driver)
    by_id(driver, "chart-row-26").click()
    assert by_id(driver, "chart-detail-day").text == ago(3).strftime("%d/%m/%Y")
    assert by_id(driver, "chart-detail-calories").text == "Calo 2.100 kcal"
    by_id(driver, "chart-open-day").click()

    assert by_id(driver, "screen-today").is_displayed()
    wait_until(
        driver,
        lambda d: ago(3).strftime("%d/%m/%Y") in d.find_element(AppiumBy.ID, "today-date").get_attribute("content-desc"),
    )
    assert by_id(driver, "today-calories").text == "2.100"

    by_id(driver, "today-chip-today").click()
    open_add_sheet(driver)
    fill(driver, name="Phở", calories="400", protein="20", sodium="1500", sugar="3")
    save(driver)
    wait_until(driver, lambda d: d.find_element(AppiumBy.ID, "today-calories").text == "850", timeout=10)

    by_text(driver, "Biểu đồ").click()
    show_table(driver)
    wait_until(driver, lambda d: row_value(d, 29) == "850 kcal", timeout=10)
    snapshot(driver, "after-new-meal")
