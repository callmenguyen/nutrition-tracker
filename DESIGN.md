---
name: Nutrition Tracker
description: Trang vở ô ly theo dõi calo, đạm, natri, đường mỗi ngày (Android, Material 3).
colors:
  paper: "#FBFBFE"
  paper-tint: "#EEEBFA"
  ink: "#1F1A2E"
  ink-muted: "#5C5670"
  violet-ink: "#4B2E83"
  on-violet-ink: "#FFFFFF"
  lavender-wash: "#E3DAFB"
  on-lavender-wash: "#2A1655"
  pencil-outline: "#7A7392"
  lavender-rule: "#B9B3E6"
  error-red: "#B3261E"
  warning-amber: "#7A5200"
  margin-red: "#D9473F"
  nutrient-calories: "#4B2E83"
  nutrient-protein: "#2E6E50"
  nutrient-sodium: "#8A5A00"
  nutrient-sugar: "#8E2F6E"
  goal-green: "#3D6B00"
  lamp-paper: "#17141F"
  lamp-paper-tint: "#262132"
  lamp-ink: "#ECE8F6"
  lamp-ink-muted: "#BDB6CF"
  lamp-violet-ink: "#CDBDFF"
  lamp-on-violet-ink: "#2A1655"
  lamp-lavender-wash: "#3B2A66"
  lamp-on-lavender-wash: "#E8DEFF"
  lamp-pencil-outline: "#8E87A6"
  lamp-rule: "#3A3452"
  lamp-error-red: "#FFB4AB"
  lamp-warning-amber: "#F2C462"
  lamp-margin-red: "#FF8A80"
  lamp-nutrient-calories: "#CDBDFF"
  lamp-nutrient-protein: "#86D4AE"
  lamp-nutrient-sodium: "#E9C16B"
  lamp-nutrient-sugar: "#F2A7D6"
  lamp-goal-green: "#B5DC7A"
typography:
  display:
    fontFamily: "Roboto, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: "44px"
    fontFeature: "tnum"
  headline:
    fontFamily: "Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: "32px"
  title:
    fontFamily: "Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: "28px"
  title-medium:
    fontFamily: "Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: "24px"
  body:
    fontFamily: "Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body-small:
    fontFamily: "Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  label-small:
    fontFamily: "Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
rounded:
  field: "4px"
  chip: "8px"
  fab: "16px"
  button: "20px"
  sheet: "28px"
spacing:
  xs: "4px"
  s: "8px"
  m: "16px"
  l: "24px"
  block: "32px"
  margin-column: "40px"
  touch-target: "48px"
components:
  button-filled:
    backgroundColor: "{colors.violet-ink}"
    textColor: "{colors.on-violet-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0 24px"
    height: "48px"
  button-text:
    textColor: "{colors.violet-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0 12px"
    height: "48px"
  text-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "8px 16px"
    height: "56px"
  fab:
    backgroundColor: "{colors.lavender-wash}"
    textColor: "{colors.on-lavender-wash}"
    rounded: "{rounded.fab}"
    size: "56px"
  chip-outlined:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "0 16px"
    height: "32px"
  bottom-sheet:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.sheet}"
    padding: "0 24px"
  nav-bar:
    backgroundColor: "{colors.paper-tint}"
    textColor: "{colors.ink-muted}"
  nav-bar-selected:
    backgroundColor: "{colors.lavender-wash}"
    textColor: "{colors.ink}"
  capacity-bar-calories:
    backgroundColor: "{colors.paper-tint}"
    height: "12px"
  capacity-bar-nutrient:
    backgroundColor: "{colors.paper-tint}"
    height: "4px"
  meal-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "8px 0"
    height: "48px"
---

# Design System: Nutrition Tracker

## Overview

**Creative North Star: "Vở ô ly"**

Mỗi ngày là một trang vở học trò: giấy trắng hơi ngả tím, mực tím, dòng kẻ lavender, một đường lề đỏ mảnh chạy dọc bên trái. Người dùng liếc một lần là biết còn bao nhiêu calo và chất nào đã vượt ngưỡng; mọi thứ khác lùi lại. Bố cục đi theo nhịp viết tay trên vở: nội dung căn sau cột lề 40 dp, khối lớn cách nhau đúng một "ô to" (32 dp), dòng món ăn ngăn bằng đường kẻ mảnh như dòng kẻ vở.

Cấu trúc là Material 3 thuần (thanh điều hướng dưới qua native tabs, FAB, bottom sheet, dialog chọn ngày M3, ô nhập outlined), nhưng Dynamic Color tắt: màu là của trang vở, không lấy từ hình nền máy, để màu từng chất và dấu lề giữ đúng một nghĩa ở mọi màn hình. Mật độ vừa phải, chữ to rõ, số luôn dùng chữ số đều hàng (tabular). Bản tối không phải bản đảo màu mà là "trang vở dưới đèn bàn": nền mực sẫm, mực tím sáng, được thiết kế riêng.

Trạng thái được báo bằng nhiều kênh cùng lúc. Vượt ngưỡng trên không chỉ đổi màu: số và vạch chuyển đỏ, dấu "!" hiện trong cột lề, và có dòng chữ "Vượt ngưỡng X". Còn / vượt so với mục tiêu là thông tin trung tính, không bị tô màu cảnh báo.

**Key Characteristics:**
- Trang giấy sáng, mực tím, đường lề đỏ mảnh làm khung cho mọi trang có nội dung theo ngày.
- Cột lề 40 dp là nơi duy nhất đặt dấu trạng thái.
- Vạch dung lượng dài cố định (không dùng vòng tròn), mỗi chất một màu cố định.
- Thang cỡ chữ cố định: calo cỡ Display, chất cỡ Title, dòng món cỡ Body.
- Material 3 về cấu trúc, màu riêng của thế giới, Dynamic Color tắt.

## Colors

Bảng màu giấy và mực: nền gần trắng, một màu mực tím chủ đạo, bốn màu chất cố định, đỏ dành riêng cho vượt ngưỡng và lỗi.

### Primary
- **Mực tím (Violet Ink)** (`violet-ink`): màu chính của trang. Nút filled, chữ nút text, con trỏ nhập, icon lịch, và là màu cố định của calo (số đã nạp cỡ Display, vạch calo). Bản tối dùng `lamp-violet-ink`.
- **Lavender nhạt (Lavender Wash)** (`lavender-wash`, chữ/icon trên nó `on-lavender-wash`): nền FAB và chỉ báo tab đang chọn.

### Secondary
- **Màu chất** (`nutrient-protein` xanh lá, `nutrient-sodium` vàng đất, `nutrient-sugar` mận; calo dùng `nutrient-calories` = mực tím): mỗi chất một màu, dùng giống hệt nhau cho giá trị cỡ Title và vạch dung lượng trên Hôm nay, trong sheet thêm món và Biểu đồ. Bản tối có bộ `lamp-nutrient-*` riêng.

### Tertiary
- **Đỏ lỗi (Error Red)** (`error-red`): giá trị và vạch của chất vượt ngưỡng trên, dấu "!" trong cột lề, dòng "Vượt ngưỡng X", viền và chữ lỗi của ô nhập, lỗi lưu dưới form.
- **Đỏ lề (Margin Red)** (`margin-red`): chỉ dùng cho đường lề dọc mảnh (2 hairline, độ mờ 45 %) của trang vở. Đây là trang trí, không mang nghĩa.
- **Hổ phách (Warning Amber)** (`warning-amber`): cảnh báo không chặn khi thiết lập mục tiêu, luôn đi kèm icon tam giác.
- **Xanh mục tiêu (Goal Green)** (`goal-green`): chỉ dùng cho đường mục tiêu nét đứt trên Biểu đồ và nhãn của nó. Xanh ngả vàng, tách khỏi `nutrient-protein` (xanh ngả lam). Bản tối `lamp-goal-green`.

### Neutral
- **Giấy (Paper)** (`paper`): nền trang và nền sheet, nền ô nhập.
- **Giấy ngả tím (Paper Tint)** (`paper-tint`): rãnh của vạch dung lượng, khối skeleton, nền thanh điều hướng, nền dòng món khi nhấn.
- **Mực (Ink)** (`ink`): chữ chính, tên món, kcal của món, icon mũi tên ngày. Nền mờ của sheet là màu này ở 32 %.
- **Mực nhạt (Ink Muted)** (`ink-muted`): nhãn ("Calo", "Đạm"), mục tiêu "/ 2.056 kcal", dòng "Còn / Vượt", dòng phụ của món, nhãn tab chưa chọn.
- **Viền bút chì (Pencil Outline)** (`pencil-outline`): viền ô nhập, viền chip, thanh kéo của sheet.
- **Dòng kẻ lavender (Lavender Rule)** (`lavender-rule`): đường kẻ mảnh giữa các dòng món và viền khung gợi ý.

### Named Rules
**The Fixed Meaning Rule.** Mỗi chất có đúng một màu, ở mọi màn hình, ở cả hai bản sáng và tối. Không có Dynamic Color, không đổi màu chất theo ngữ cảnh. Màu chỉ bị thay bằng `error-red` khi chất đó vượt ngưỡng trên.

**The Neutral Remainder Rule.** "Còn X kcal" và "Vượt X kcal" (so với mục tiêu) luôn màu `ink-muted`. Đỏ chỉ dành cho tổng vượt **ngưỡng trên**.

**The Never Colour Alone Rule.** Vượt ngưỡng luôn là ba kênh cùng lúc: số và vạch đỏ, dấu "!" trong cột lề (có nhãn đọc "Vượt ngưỡng"), và chữ "Vượt ngưỡng X". Cảnh báo hổ phách luôn có icon. Lỗi ô nhập luôn có chữ dưới ô.

**The Contrast Floor Rule.** Mọi vai trò chữ (`ink`, `ink-muted`, `violet-ink`, `error-red`, `warning-amber`, `goal-green` và bản tối tương ứng) đạt ít nhất 4.5:1 trên `paper` và `paper-tint`; có test tự động kiểm tra.

## Typography

**Font:** font hệ thống của máy (Roboto trên Android gốc) theo thang chữ M3; không nhúng font riêng. Chủ dự án chốt 2026-11-17: tôn trọng font người dùng chọn trên máy, kể cả font kiểu viết tay của một số ROM (MIUI); vì vậy chữ số đều hàng (`tabular-nums`) chỉ được đảm bảo khi font hệ thống hỗ trợ.

**Character:** Một họ chữ duy nhất, phân cấp bằng cỡ và độ đậm. Số dùng chữ số đều hàng (`tabular-nums`) để các giá trị thẳng cột.

### Hierarchy
- **Display** (700, 36/44 sp, tabular): chỉ cho số calo đã nạp. Một lần mỗi trang.
- **Headline** (500, 24/32 sp): tiêu đề màn hình form và tiêu đề sheet ("Thêm món", "Sửa món").
- **Title** (500, 22/28 sp): mục tiêu calo "/ 2.056 kcal" và giá trị chất "25 / 112 g".
- **Title Medium** (500, 16/24 sp): nhãn "Calo", tiêu đề mục "Món đã ăn", ngày trên thanh ngày, giá trị trong bảng mục tiêu.
- **Body** (400, 16/24 sp): tên món và kcal của món, nhãn chất, dòng "Còn / Vượt", chữ trong ô nhập, gợi ý.
- **Body Small** (400, 14/20 sp): dòng phụ của món, lỗi dưới ô, "Vượt ngưỡng" của chất, cảnh báo.
- **Label** (500, 14/20 sp): chữ nút, nhãn ô nhập, chữ chip.
- **Label Small** (500, 12/16 sp): dự phòng cho nhãn phụ.

### Named Rules
**The Size Ladder Rule.** Calo cỡ Display, chất cỡ Title, dòng món cỡ Body. Không đổi bậc giữa các màn hình; thứ bậc thông tin nằm ở cỡ chữ, không ở màu.

**The Vietnamese Numbers Rule.** Số có dấu chấm phân nghìn ("2.350") và dấu phẩy thập phân ("25,3"); chất đã nạp tối đa một chữ số thập phân, mục tiêu là số nguyên. Ngày `dd/MM/yyyy`, giờ 24h. Mọi số đứng thành cột dùng chữ số đều hàng.

## Layout

Đơn vị 8 dp. Trang Hôm nay là một cột cuộn duy nhất trong `NotebookPage`: mỗi dòng là một `MarginRow` gồm cột lề rộng 40 dp bên trái (chứa dấu trạng thái, căn giữa với dòng đầu) và phần nội dung có lề phải 16 dp. Đường lề đỏ nằm ở 32 dp, kéo hết chiều cao trang (trang luôn lấp đầy màn hình kể cả khi trống).

Nhịp dọc: 32 dp (`block`, "một ô to") giữa các khối lớn (thanh ngày, khối Calo, mục Món đã ăn); 16 dp giữa các hàng chất; 8 dp giữa số và vạch, giữa vạch và dòng trạng thái. Đầu trang đệm 16 dp, cuối trang 96 dp để dòng món cuối không bị FAB che.

Form và sheet dùng lề ngang 24 dp, khoảng cách giữa ô 16 dp; các ô số xếp lưới hai cột với khe 16 dp. Mọi vùng chạm tối thiểu 48 dp (dòng món, gợi ý, mũi tên ngày, chip, nút).

### Named Rules
**The Margin Column Rule.** Dấu trạng thái chỉ được đặt trong cột lề 40 dp, không bao giờ trong phần nội dung. Đường lề đỏ là trang trí; nghĩa chỉ đến từ dấu trong cột lề.

## Elevation & Depth

Phẳng như giấy. Chiều sâu đến từ lớp tông (`paper` so với `paper-tint`) và đường kẻ, không từ bóng. Hai ngoại lệ đều là Material 3 chuẩn: FAB có elevation 3 của Android, và sheet nổi trên nền mờ `ink` 32 %. Skeleton là khối `paper-tint` đứng yên đúng hình bố cục, không có hiệu ứng shimmer.

### Named Rules
**The Flat Page Rule.** Thẻ, hàng và khối trên trang không có bóng và không có nền thẻ riêng. Chỉ FAB và sheet được nổi.

**The Readable Status Bar Rule.** Thanh trạng thái trong suốt (edge-to-edge) và nằm trên nền trang, nên icon theo tông của trang: icon tối trên `paper` sáng, icon sáng trên trang tối. Đặt một lần ở layout gốc (`SystemBars`), theo cùng cài đặt sáng/tối với bảng màu; sheet và hộp thoại (`Modal`) tự lấy kiểu này khi mở (#54).

## Shapes

Góc bo theo vai trò M3: ô nhập 4 dp, chip và khung gợi ý 8 dp, FAB 16 dp, nút 20 dp (viên thuốc ở chiều cao 48 dp), sheet bo hai góc trên 28 dp. Vạch dung lượng bo tròn hai đầu (bán kính bằng nửa chiều cao). Đường kẻ dòng món và viền khung gợi ý là hairline; viền ô nhập và chip 1 dp. Thanh kéo của sheet 32 × 4 dp.

## Components

### Buttons
Gọn, một hành động chính mỗi nhóm.
- **Shape:** viên thuốc (bo 20 dp), cao tối thiểu 48 dp; đệm ngang 24 dp cho Filled, 12 dp cho Text (M3).
- **Filled:** nền `violet-ink`, chữ `on-violet-ink`, cỡ Label. Dùng cho hành động chính ("Lưu").
- **Text:** không nền, chữ `violet-ink`. Dùng cho "Thử lại", "Thêm món" ở trạng thái trống, "Xoá" (trái, chỉ khi sửa). Khi nút chữ mở đầu một `MarginRow`, lùi trái 12 dp để chữ thẳng mép nội dung; mũi tên "‹" đầu thanh ngày cũng vậy.
- **Nhấn / vô hiệu / đang tải:** nhấn giảm độ mờ còn 85 %; vô hiệu 38 %; đang tải thay chữ bằng spinner cùng màu chữ.

### Chips
- **Style:** viền 1 dp `pencil-outline`, bo 8 dp, chữ cỡ Label, không nền.
- **Dùng cho:** chip "Hôm nay" trên thanh ngày (cao 32 dp, vùng chạm mở rộng) khi đang xem ngày khác; chip "Ngày dd/MM/yyyy" trong sheet (cao 48 dp) mở lịch M3.

### Inputs / Fields
- **Style:** outlined M3, nhãn cỡ Label `ink-muted` nằm trên ô, viền 1 dp `pencil-outline`, nền `paper`, bo 4 dp, cao tối thiểu 56 dp.
- **Error:** viền chuyển `error-red`, chữ lỗi cỡ Body Small ngay dưới ô (đọc qua live region).
- **Mật khẩu:** nút chữ "Hiện / Ẩn" màu `violet-ink` trong ô.

### Navigation
- **Style:** thanh điều hướng dưới Material qua native tabs: Hôm nay (`menu_book`) · Biểu đồ (`bar_chart`) · Cài đặt (`settings`). Nền `paper-tint`, chỉ báo tab chọn `lavender-wash`, icon chọn `on-lavender-wash`, nhãn chọn `ink`, chưa chọn `ink-muted`.
- **Thanh ngày:** nằm trong trang vở (không dùng app bar): mũi tên trái · ngày `dd/MM/yyyy` cỡ Title Medium (mở dialog chọn ngày M3, ngày tương lai bị khoá) · mũi tên phải (khoá ở hôm nay) · chip "Hôm nay".
- **Dialog chọn ngày:** tên tháng, thứ và ngày đầu tuần theo ngôn ngữ của máy (chủ dự án chốt 2026-11-17); chỉ nút "Chọn" / "Hủy" do app đặt. Tiêu đề tiếng Anh mặc định ("Select date") bị ẩn.

### Bottom Sheet
- Modal trượt lên, nền mờ `ink` 32 %, sheet nền `paper`, bo trên 28 dp, cao tối đa 90 %, thanh kéo `pencil-outline` 60 %. Tiêu đề cỡ Headline. Thứ tự: Tên món (bàn phím mở ngay) · tối đa 5 gợi ý trong khung hairline · lưới Calo / Đạm / Natri / Đường · chip ngày. Hàng nút (Xoá trái, Lưu phải) là footer cố định ngoài vùng cuộn, nên "Lưu" luôn nằm ngay trên bàn phím (gõ → chọn gợi ý → Lưu, ≤ 3 chạm); khi bàn phím đóng, footer chừa thêm inset dưới của thanh điều hướng. Lỗi lưu hiện dưới form, sheet và dữ liệu giữ nguyên.

### FAB
- 56 dp, bo 16 dp, nền `lavender-wash`, icon `add` màu `on-lavender-wash`, cách mép phải và dưới 16 dp. Chỉ hiện khi dữ liệu đã tải.

### Capacity Bar (signature)
Vạch dài cố định, không phải vòng tròn. Rãnh `paper-tint`, phần đã nạp màu của chất (đầy tối đa khi chạm mục tiêu), bo tròn hai đầu. Calo cao 12 dp, chất cao 4 dp. Khi vượt ngưỡng trên, phần đã nạp chuyển `error-red`.

### Margin Row (signature)
Dòng nội dung với cột lề 40 dp. Dấu "alert" là vòng tròn 24 dp viền 2 dp `error-red` với chữ "!" đậm ở giữa (vẽ bằng view, không dùng icon font vì glyph Android bị cắt), bắt buộc có nhãn đọc cho TalkBack. Dấu căn giữa trong 32 dp bên trái đường lề (không chạm đường lề) và căn giữa theo dòng đầu của hàng (`firstLineHeight`: 24 cho Body / Title Medium, 28 cho hàng chất cỡ Title). Dùng cho khối Calo, hàng chất vượt ngưỡng, và thông báo lỗi tải.

### Meal Row
- Cao tối thiểu 48 dp, đệm dọc 8 dp, đường kẻ dưới hairline `lavender-rule` chạy hết bề ngang như dòng kẻ vở. Tên món cỡ Body (tối đa 2 dòng) và kcal căn phải; dòng phụ "Đạm X g · Natri Y mg · Đường Z g" cỡ Body Small `ink-muted`. Nhấn: nền `paper-tint`; chạm mở sheet ở chế độ sửa.

### Chart (Biểu đồ)
Canvas Skia cao 240 dp trong cột nội dung. Series dùng màu của chất (The Fixed Meaning Rule): cột bo 3 dp ở hai góc trên, hoặc đường 2 dp kèm chấm 4 dp ở mỗi ngày có dữ liệu. Ngày chưa ghi không có cột và làm đường bị ngắt, không vẽ 0. Đường ngưỡng ngang nét đứt 1,5 dp, nhãn chữ 12 sp cùng màu ở mép phải: ngưỡng trên `error-red` (nét dài 10/3), mục tiêu `goal-green` (nét 6/4), ngưỡng dưới và BMR `pencil-outline` chấm (2/4), an toàn `pencil-outline` nét 6/4. Nhãn không chồng lên nhau và không xuống dưới nhãn trục X. Trục và nhãn `ink-muted`, đường trục `lavender-rule`. Ngày đang chọn có vạch dọc `lavender-rule`. Chú thích dưới biểu đồ lặp lại các series và ngưỡng kèm giá trị, nên không phải chỉ dựa vào màu. Thẻ chi tiết nền `paper-tint`, bo 12 dp. Chế độ bảng là các dòng 48 dp, ngăn bằng đường kẻ mảnh như dòng món.

### Warning Note
- Icon tam giác 18 dp + chữ Body Small, cả hai màu `warning-amber`, ngay dưới ô liên quan; không chặn lưu.

## Do's and Don'ts

### Do:
- **Do** đặt nội dung theo ngày trong `NotebookPage` và căn từng dòng bằng `MarginRow` (cột lề 40 dp).
- **Do** dùng màu chất cố định từ bảng `nutrient-*` cho cả số và vạch của chất đó, trên mọi màn hình.
- **Do** báo vượt ngưỡng trên bằng ba kênh: đỏ, dấu "!" trong cột lề, chữ "Vượt ngưỡng X".
- **Do** giữ "Còn / Vượt X kcal" so với mục tiêu ở màu `ink-muted`.
- **Do** viết số kiểu Việt Nam ("2.350", "25,3"), ngày `dd/MM/yyyy`, giờ 24h, chữ số đều hàng.
- **Do** cách các khối lớn 32 dp và giữ vùng chạm ≥ 48 dp.
- **Do** thiết kế bản tối riêng ("dưới đèn bàn") với bộ `lamp-*`, không đảo màu tự động.
- **Do** dùng dialog xác nhận cho thao tác xoá và bỏ dữ liệu chưa lưu.

### Don't:
- **Don't** bật Dynamic Color hay lấy màu từ hình nền máy.
- **Don't** dùng vòng tròn tiến độ cho calo hay chất; dùng vạch dài cố định.
- **Don't** đặt dấu trạng thái trong phần nội dung, hay dùng đỏ cho việc chỉ vượt mục tiêu.
- **Don't** để màu là kênh duy nhất của một trạng thái.
- **Don't** thêm bóng hay nền thẻ cho các khối trên trang; chỉ FAB và sheet được nổi.
- **Don't** thêm nút Hoàn tác sau khi lưu hoặc xoá.
- **Don't** đổi bậc cỡ chữ của calo, chất, dòng món giữa các màn hình.
