"""Add / edit / delete meals through the bottom sheet (issue #17), on the mock backend (ADR-016).

Own account with a profile (Goals.md §4 example 1). Runs last (after test_today.py, which signs out).
Each test works on its own past day so the tests do not see each other's meals:
yesterday (TC-E2E-10), today (TC-E2E-11), 2 days ago (TC-E2E-13, 16), 3 days ago (TC-E2E-14, 15),
4 days ago (MEAL-16, 17).
"""

import datetime
import time

import pytest
from appium.webdriver.common.appiumby import AppiumBy

from conftest import REPORTS_DIR, create_user_with_profile, fault, saved_foods
from test_auth import by_id, go_to_login, type_into
from test_onboarding import absent, by_text, present, sign_out_from_tabs, wait_until

EMAIL = "e2e-meals@example.com"
PASSWORD = "e2e-password-1"
TODAY = datetime.date.today()


def vi(day: datetime.date) -> str:
    return day.strftime("%d/%m/%Y")


@pytest.fixture(scope="module", autouse=True)
def meals_account():
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


@pytest.fixture(autouse=True)
def leave_sheet_on_failure(driver, request):
    """A failed test may leave the sheet or a dialog open: close them so the next test starts on Hôm nay."""
    yield
    rep = getattr(request.node, "rep_call", None)
    if rep is None or not rep.failed:
        return
    driver.implicitly_wait(0)
    try:
        for _ in range(6):
            if driver.find_elements(AppiumBy.ID, "screen-today") and not driver.find_elements(
                AppiumBy.ID, "meal-sheet"
            ):
                return
            for label in ("Bỏ", "Hủy"):
                found = driver.find_elements(
                    AppiumBy.ANDROID_UIAUTOMATOR, f'new UiSelector().textMatches("(?iu){label}")'
                )
                if found:
                    found[0].click()
                    break
            else:
                driver.back()
    finally:
        driver.implicitly_wait(10)


def snapshot(driver, name: str) -> None:
    folder = REPORTS_DIR / "screenshots"
    folder.mkdir(parents=True, exist_ok=True)
    driver.get_screenshot_as_file(str(folder / f"sheet-{name}.png"))


def open_today(driver):
    if driver.find_elements(AppiumBy.ID, "screen-today"):
        return
    go_to_login(driver)
    type_into(driver, "login-email", EMAIL)
    type_into(driver, "login-password", PASSWORD)
    by_id(driver, "login-submit").click()
    assert by_id(driver, "screen-today").is_displayed()


def go_to_day(driver, days_ago: int):
    """From any viewed day: back to today with the chip, then '‹' days_ago times."""
    open_today(driver)
    chip = driver.find_elements(AppiumBy.ID, "today-chip-today")
    if chip:
        chip[0].click()
    for _ in range(days_ago):
        by_id(driver, "today-prev").click()
    day = TODAY - datetime.timedelta(days=days_ago)
    wait_until(driver, lambda d: vi(day) in d.find_element(AppiumBy.ID, "today-date").get_attribute("content-desc"))


def meal_names(driver) -> list[str]:
    names = []
    for i in range(15):
        found = driver.find_elements(AppiumBy.ID, f"meal-row-{i}-name")
        if not found:
            break
        names.append(found[0].text)
    return names


def open_add_sheet(driver):
    by_id(driver, "today-add").click()
    assert by_id(driver, "meal-sheet").is_displayed()
    # Brief: the name field is focused and the keyboard is open right away.
    try:
        wait_until(driver, lambda d: d.is_keyboard_shown(), timeout=5)
    except Exception:
        # Diagnostic: can the keyboard open at all here when the field is tapped?
        by_id(driver, "meal-name").click()
        shown = driver.is_keyboard_shown()
        raise AssertionError(f"keyboard did not open on show (opens on tap: {shown})")


def fill(driver, **values):
    for field, text in values.items():
        type_into(driver, f"meal-{field}", text)


def dialog_title(driver) -> str:
    """Title of the Android alert on screen (exact text, no regex: '?' needs no escaping this way)."""
    return driver.find_element(
        AppiumBy.ANDROID_UIAUTOMATOR, 'new UiSelector().resourceIdMatches(".*:id/alert_title")'
    ).text


def close_keyboard(driver):
    """Back closes only the keyboard (MEAL-19); Appium's hide_keyboard fails inside the sheet's Modal."""
    if driver.is_keyboard_shown():
        driver.back()
        wait_until(driver, lambda d: not d.is_keyboard_shown())


def save(driver, expect_closed=True):
    close_keyboard(driver)
    by_id(driver, "meal-save").click()
    if expect_closed:
        wait_until(driver, absent("meal-sheet"), timeout=10)


BUN_NAM = {"name": "Bún nạm", "calories": "450", "protein": "25", "sodium": "1800", "sugar": "6"}


def test_add_meal_on_the_viewed_day(driver):
    """TC-E2E-10 · MEAL-02, MEAL-09: a meal added while viewing yesterday lands on yesterday only."""
    go_to_day(driver, 1)
    open_add_sheet(driver)
    snapshot(driver, "empty")
    assert vi(TODAY - datetime.timedelta(days=1)) in by_id(driver, "meal-date").get_attribute("content-desc")
    fill(driver, **BUN_NAM)
    save(driver)
    wait_until(driver, lambda d: meal_names(d) == ["Bún nạm"], timeout=10)
    assert by_id(driver, "today-calories").text == "450"
    assert "natri 1.800 mg" in by_id(driver, "meal-row-0").get_attribute("content-desc")

    by_id(driver, "today-chip-today").click()
    assert by_id(driver, "today-empty").is_displayed()


def test_suggestion_fills_and_saved_food_follows_latest(driver):
    """TC-E2E-11 · MEAL-03, 04, 05, 06: 'bun' suggests Bún nạm with yesterday's values; saving 500 updates
    the suggestion but not yesterday's meal; 'bún  NẠM ' does not create a second saved food."""
    go_to_day(driver, 0)
    open_add_sheet(driver)
    type_into(driver, "meal-name", "bun")
    wait_until(driver, present("meal-suggestion-0"), timeout=10)
    snapshot(driver, "suggestions")
    assert "Bún nạm" in by_id(driver, "meal-suggestion-0").get_attribute("content-desc")
    by_id(driver, "meal-suggestion-0").click()
    assert by_id(driver, "meal-name").text == "Bún nạm"
    assert [by_id(driver, f"meal-{f}").text for f in ("calories", "protein", "sodium", "sugar")] == [
        "450",
        "25",
        "1800",
        "6",
    ]
    type_into(driver, "meal-calories", "500")
    # ≤ 3 taps (brief): "Lưu" sits above the keyboard, so it is tapped without closing it first.
    assert driver.is_keyboard_shown()
    driver.find_element(AppiumBy.ID, "meal-save").click()
    wait_until(driver, absent("meal-sheet"), timeout=10)
    wait_until(driver, lambda d: d.find_element(AppiumBy.ID, "today-calories").text == "500", timeout=10)

    # MEAL-04 and MEAL-05: "nạm" matches (contains), and the suggestion now carries 500.
    open_add_sheet(driver)
    type_into(driver, "meal-name", "nạm")
    wait_until(driver, present("meal-suggestion-0"), timeout=10)
    assert "500 kcal" in by_id(driver, "meal-suggestion-0").get_attribute("content-desc")
    # MEAL-06: extra spaces and capitals map to the same saved food.
    fill(driver, name="bún  NẠM ", calories="480", protein="20", sodium="1500", sugar="5")
    save(driver)
    assert [f["name"] for f in saved_foods(EMAIL)] == ["bún NẠM"]

    go_to_day(driver, 1)
    assert by_id(driver, "today-calories").text == "450"  # yesterday's copy is unchanged


def test_validation_keeps_typed_data(driver):
    """TC-E2E-13 · MEAL-10: invalid values are not saved, each field says why, typed data stays."""
    go_to_day(driver, 2)
    open_add_sheet(driver)
    save(driver, expect_closed=False)
    for field in ("name", "calories", "protein", "sodium", "sugar"):
        assert by_id(driver, f"meal-{field}-error").is_displayed()
    fill(driver, name="a" * 101, calories="5001", protein="1.25", sodium="1800", sugar="6")
    save(driver, expect_closed=False)
    assert by_id(driver, "meal-name-error").text == "Tên món tối đa 100 ký tự"
    assert by_id(driver, "meal-calories-error").text == "Calo từ 0 đến 5.000 kcal"
    assert by_id(driver, "meal-protein-error").text == "Đạm tối đa 1 chữ số thập phân"
    snapshot(driver, "errors")
    assert by_id(driver, "meal-calories").text == "5001"
    assert by_id(driver, "meal-sheet").is_displayed()
    driver.back()
    by_text(driver, "Bỏ").click()
    assert by_id(driver, "today-empty").is_displayed()


def test_back_closes_keyboard_then_suggestions_then_asks(driver):
    """TC-E2E-16 · MEAL-18, MEAL-19: Back closes the keyboard, then the suggestions, then asks
    'Bỏ món này?'; 'Ở lại' keeps the data."""
    go_to_day(driver, 0)
    open_add_sheet(driver)
    type_into(driver, "meal-name", "bun")
    wait_until(driver, present("meal-suggestion-0"), timeout=10)
    assert driver.is_keyboard_shown()
    snapshot(driver, "keyboard")

    driver.back()
    wait_until(driver, lambda d: not d.is_keyboard_shown())
    assert by_id(driver, "meal-suggestions").is_displayed()

    driver.back()
    wait_until(driver, absent("meal-suggestions"))
    assert by_id(driver, "meal-sheet").is_displayed()

    driver.back()
    assert dialog_title(driver) == "Bỏ món này?"
    by_text(driver, "Ở lại").click()
    assert by_id(driver, "meal-name").text == "bun"

    driver.back()
    by_text(driver, "Bỏ").click()
    wait_until(driver, absent("meal-sheet"))


def test_order_kept_after_restart_and_edit(driver, config):
    """TC-E2E-14 · MEAL-11: three meals keep their order after the app restarts and the first is edited."""
    go_to_day(driver, 3)
    for name, kcal in (("Món A", "300"), ("Món B", "200"), ("Món C", "100")):
        open_add_sheet(driver)
        fill(driver, name=name, calories=kcal, protein="10", sodium="100", sugar="1")
        save(driver)
    wait_until(driver, lambda d: meal_names(d) == ["Món A", "Món B", "Món C"], timeout=10)

    driver.terminate_app(config["appPackage"])
    driver.activate_app(config["appPackage"])
    go_to_day(driver, 3)
    wait_until(driver, lambda d: meal_names(d) == ["Món A", "Món B", "Món C"], timeout=10)

    by_id(driver, "meal-row-0").click()
    assert by_id(driver, "meal-name").text == "Món A"
    type_into(driver, "meal-calories", "350")
    save(driver)
    wait_until(driver, lambda d: d.find_element(AppiumBy.ID, "today-calories").text == "650", timeout=10)
    assert meal_names(driver) == ["Món A", "Món B", "Món C"]


def test_delete_asks_and_keeps_saved_food(driver):
    """TC-E2E-15 (delete part; the saved-food part is the next test) · MEAL-12."""
    go_to_day(driver, 3)
    by_id(driver, "meal-row-1").click()
    by_id(driver, "meal-delete").click()
    assert dialog_title(driver) == "Xoá món này?"
    by_text(driver, "Hủy").click()
    driver.back()  # nothing changed: the sheet closes without asking
    wait_until(driver, absent("meal-sheet"))
    assert meal_names(driver) == ["Món A", "Món B", "Món C"]

    by_id(driver, "meal-row-1").click()
    by_id(driver, "meal-delete").click()
    by_text(driver, "Xoá").click()
    wait_until(driver, lambda d: meal_names(d) == ["Món A", "Món C"], timeout=10)
    assert by_id(driver, "today-calories").text == "450"
    assert "Món B" in [f["name"] for f in saved_foods(EMAIL)]


def long_press(driver, test_id: str):
    driver.execute_script("mobile: longClickGesture", {"elementId": by_id(driver, test_id).id})


def test_delete_saved_food_keeps_logged_meals(driver):
    """TC-E2E-15 (Cài đặt › Món đã lưu) · MEAL-13: 'bun' finds the saved Bún nạm; long-press asks first;
    after deleting it 'bun' suggests nothing, and yesterday's logged Bún nạm keeps 450 kcal.
    Uses the saved food 'bún NẠM' left by test_suggestion_fills_and_saved_food_follows_latest."""
    open_today(driver)
    by_text(driver, "Cài đặt").click()
    by_id(driver, "settings-saved-foods").click()
    assert by_id(driver, "screen-saved-foods").is_displayed()
    type_into(driver, "saved-foods-search", "bun")
    wait_until(driver, absent("saved-food-row-1"), timeout=10)
    assert by_id(driver, "saved-food-row-0-name").text == "bún NẠM"
    snapshot(driver, "saved-foods")

    long_press(driver, "saved-food-row-0")
    assert dialog_title(driver) == "Xoá món đã lưu?"
    by_text(driver, "Hủy").click()
    assert by_id(driver, "saved-food-row-0-name").text == "bún NẠM"

    long_press(driver, "saved-food-row-0")
    by_text(driver, "Xoá").click()
    # "Không có món nào khớp" while other saved foods remain; the empty state when it was the last one.
    wait_until(driver, lambda d: present("saved-foods-no-match")(d) or present("saved-foods-empty")(d), timeout=10)
    assert "bún NẠM" not in [f["name"] for f in saved_foods(EMAIL)]

    by_id(driver, "screen-saved-foods-back").click()
    by_text(driver, "Hôm nay").click()
    go_to_day(driver, 1)
    assert meal_names(driver) == ["Bún nạm"]
    assert by_id(driver, "today-calories").text == "450"

    open_add_sheet(driver)
    type_into(driver, "meal-name", "bun")
    time.sleep(2)  # past the 250 ms debounce and the request: a suggestion would be on screen by now
    assert not driver.find_elements(AppiumBy.ID, "meal-suggestion-0")
    close_keyboard(driver)
    driver.back()
    by_text(driver, "Bỏ").click()
    wait_until(driver, absent("meal-sheet"))


def test_network_errors_never_fake_a_save(driver):
    """MEAL-16, MEAL-17: a lost request keeps the sheet and data and adds nothing; a save the server wrote
    but never answered, sent again, still gives one meal."""
    go_to_day(driver, 4)
    fault("/rest/v1/rpc/log_meal", "drop")
    open_add_sheet(driver)
    fill(driver, name="Phở", calories="400", protein="20", sodium="1500", sugar="3")
    save(driver, expect_closed=False)
    assert "kết nối" in by_id(driver, "meal-form-error").text
    assert by_id(driver, "meal-name").text == "Phở"
    save(driver)
    wait_until(driver, lambda d: meal_names(d) == ["Phở"], timeout=10)

    fault("/rest/v1/rpc/log_meal", "drop-after")
    open_add_sheet(driver)
    fill(driver, name="Chè", calories="250", protein="3", sodium="20", sugar="30")
    save(driver, expect_closed=False)
    assert by_id(driver, "meal-form-error").is_displayed()
    save(driver)
    wait_until(driver, lambda d: meal_names(d) == ["Phở", "Chè"], timeout=10)

    sign_out_from_tabs(driver)
