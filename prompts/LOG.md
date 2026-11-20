# Nhật ký prompt — Nutrition Tracker

Mọi yêu cầu của người dùng đã dựng nên dự án này, theo thứ tự thời gian. Mỗi yêu cầu dẫn tới thay đổi trong repo có một mục, được ghi trong cùng PR với thay đổi đó. Chỉ thêm mục mới, không sửa hay xoá mục cũ (yêu cầu sau thay đổi yêu cầu trước thì ghi mục mới và trỏ về mục cũ).

Quy tắc:
- **Yêu cầu:** rút gọn, giữ ý định sản phẩm và các ràng buộc người dùng nêu; bỏ phần trao đổi qua lại.
- **Quyết định:** những gì người dùng đã chốt khi agent hỏi lại (phương án được chọn, phần bị loại).
- Không ghi secret, token, mật khẩu, URL môi trường thật, email hay dữ liệu cá nhân.
- Prompt giao việc cho một giai đoạn lớn vẫn nằm ở `prompts/NN-slug.txt`; mục nhật ký chỉ trỏ tới file đó.

Mẫu một mục:

```markdown
## YYYY-MM-DD · <lệnh hoặc ngữ cảnh, ví dụ `/kessie-skills:proj build #12`>
- **Yêu cầu:** <ý định của người dùng, 1–3 câu>
- **Quyết định:** <đã chốt gì; "—" nếu không có>
- **Kết quả:** <issue/PR, file prompt giai đoạn nếu có>
```

---

## 2026-11-04 · `/kessie-skills:proj kickoff <ý tưởng>`
- **Yêu cầu:** App mobile theo dõi dinh dưỡng hằng ngày, dùng React Native + Expo và Supabase.
  - Ghi món ăn kèm calo, đạm, natri, đường; ngày ghi mặc định là hôm nay, chỉ được chọn ngày quá khứ.
  - Gợi ý lại món đã nhập (ví dụ "bún nạm") và tự điền dinh dưỡng của lần nhập trước.
  - Lần đầu nhập cân nặng, chiều cao; mục tiêu ngày gợi ý theo BMI, giới tính và mong muốn (tăng, giảm, giữ cân), người dùng tự đặt lại được.
  - Tài khoản role user, mỗi user có dữ liệu riêng. Push nhắc ghi chép (Firebase), giờ nhắc chỉnh trong Cài đặt.
  - Biểu đồ đường hoặc cột có đường BMR, an toàn (BMR + 300), mục tiêu, trần 4000; đường, natri, đạm có ngưỡng theo WHO.
  - Workout bật/tắt trong Cài đặt: activity, sub-activity, lịch lặp, chặn trùng lịch (ghi trong `docs/ADR.md`, kèm hướng dẫn trong CLAUDE.md), nhắc trước 30 phút, calo tính vào biểu đồ.

  Remote: `antialberteinstein/nutrition-tracker`.
- **Quyết định:**
  - **Phạm vi:** Workout tách sang 0.2.0.
  - **Hồ sơ và mục tiêu:**
    - Onboarding hỏi thêm năm sinh và mức vận động; BMR theo Mifflin-St Jeor;
    - điều chỉnh calo −500 / 0 / +300, kèm cảnh báo khi ngược mong muốn;
    - khi bật Workout, TDEE dùng hệ số 1.2.
  - **Ngưỡng:**
    - đạm 0.8 / 1.6 / 2.2 g/kg;
    - natri nhập theo mg: 500 / 1500 / 2000;
    - đường 5% / 10% calo;
    - phân loại BMI theo chuẩn châu Á – Thái Bình Dương.
  - **Workout:** calo chỉ tính khi đánh dấu "Đã tập"; lịch gồm giờ bắt đầu + thời lượng; thêm sub đầu tiên thì chuyển lịch sang sub đó.
  - **Tài khoản và phát hành:** chỉ email + mật khẩu; cần mạng; 0.1.0 chỉ phát hành Android APK.
  - **Ngoài phạm vi:** cơ sở dữ liệu món ăn, admin, Apple Health / Google Fit, đa ngôn ngữ.
  - **Loại dự án:** A.
- **Kết quả:** `docs/IdeaBrief.md`, `docs/RequirementsOutline.md`, `docs/modules/*` (đã duyệt), `docs/ADR.md` (13 ADR) — commit `docs: kickoff phases 0–2`.

## 2026-11-04 · Góp ý ADR-008 (chặn trùng lịch)
- **Yêu cầu:** Cặp có lịch hằng ngày chỉ chặn theo giờ; cặp tuần–tuần xét thứ trùng và giờ trùng; không cho lặp hằng tháng (ghi rõ đánh đổi); dùng bitmask để kiểm nhanh.
- **Quyết định:** Bỏ lặp hằng tháng. Điều kiện trùng là `(maskA & maskB) != 0` và giờ giao nhau; ngày trùng đầu tiên tính bằng phép xoay bit. Bỏ WO-07, WO-08, WO-09; thêm WO-30 đến WO-35.
- **Kết quả:** `docs/ADR.md` (ADR-008), `docs/modules/Workout.md`, `docs/RequirementsOutline.md`.

## 2026-11-04 · Góp ý ADR-012 và ADR-006, duyệt các ADR còn lại
- **Yêu cầu:**
  - E2E bằng Appium + Python (uv) trong `e2e/mobile-appium`, UDID máy test lưu ở `config.json` (gitignore).
  - Thêm `scripts/build-debug-apk.sh`, `run-metro.sh`, `run-test.sh`.
  - Chụp màn hình khi lỗi vào `reports/` (gitignore, mỗi lần chạy ghi đè).
  - Tài liệu `docs/testing/test-plan.md` và `test-cases.md`.
  - CLAUDE.md: sửa dựa trên `reports/`; báo người dùng khi thiết bị chưa kết nối; không tự chạy máy ảo hay `adb`.
  - Thông báo không cần đúng giờ khi chưa dùng FCM; khi dùng FCM thì trễ tối đa 5 phút.
- **Quyết định:** Appium thay cho Maestro; `run-test.sh` thoát mã 3 khi chưa có thiết bị; nới các AC về thời gian thông báo (REM-02, REM-05, WO-26, WO-28). Cả 13 ADR đã chốt.
- **Kết quả:** `docs/ADR.md`, `docs/testing/*`, spec cập nhật.

## 2026-11-04 · `/impeccable:impeccable init` và `shape today-screen`
- **Yêu cầu:** Ghi bối cảnh sản phẩm, rồi dựng brief thiết kế cho tab Hôm nay.
- **Quyết định:**
  - Nền tảng: Android, Material 3. Tên "Nutrition Tracker"; giọng văn trung tính, xưng "bạn".
  - Bố cục: tiêu điểm là calo, 3 chất gọn bên dưới; form ghi món dạng bottom sheet; vượt ngưỡng hiện bằng màu + icon + chữ.
  - Hướng hình ảnh "Vở ô ly" (chọn thay cho lượt bốc thăm "Hoá đơn quán"). Dynamic Color tắt; không có Hoàn tác sau khi lưu.
- **Kết quả:** `PRODUCT.md`, `.impeccable/surfaces/` (brief tab Hôm nay).

## 2026-11-04 · `/kessie-skills:proj kickoff` (giai đoạn 3: nền repo)
- **Yêu cầu:** Dựng nền repo theo kế hoạch đã duyệt: git, Expo, scaffold, Supabase, lint/test, E2E Appium, CI. Dừng trước khi push.
- **Quyết định:**
  - License MIT.
  - Expo SDK 58 (route trong `src/app/`), package `io.github.antialberteinstein.nutritiontracker`.
  - `eslint.config.js` do `expo lint` sinh; Prettier dùng cấu hình mặc định (hook config-protection chặn tạo file cấu hình riêng).
  - Supabase CLI là devDependency (`npx supabase`).
- **Kết quả:** commit `chore: scaffold repository foundation`.

## 2026-11-04 · `/kessie-skills:proj plan`
- **Yêu cầu:** Lên kế hoạch milestone 0.1.0 từ các AC đã duyệt.
- **Quyết định:** Duyệt 17 issue theo thứ tự nền → lõi → giao diện → tích hợp → kiểm tra trên thiết bị → phát hành. Luồng mỏng đi trước: tài khoản → onboarding → ghi món → Hôm nay. Viết 2 prompt giai đoạn. Milestone 0.2.0 (Workout) để plan sau.
- **Kết quả:** milestone `0.1.0`, issue #7–#23; `prompts/01-foundation.txt`, `prompts/02-meal-log.txt`.
## 2026-11-04 · Xác nhận sau giai đoạn 3
- **Yêu cầu:** Push 2 commit đầu lên GitHub; bật bảo vệ `main` khi CI xanh; thêm plugin chính chủ của Expo vào bảng "Skill bổ trợ".
- **Quyết định:** Thêm `expo@claude-plugins-official` vào bảng (chỉ gợi ý lệnh cài, không tự cài). Bảo vệ `main`: bắt buộc PR và hai check CI, cấm force-push, không bắt buộc reviewer.
- **Kết quả:** PR `docs/claude-expo-skill`.

## 2026-11-04 · Quy tắc review và merge PR tự động
- **Yêu cầu:** Thêm vào CLAUDE.md:
  - mỗi khi mở PR mới, tạo sub-agent gọi skill `kessie-skills:pr-review` để review;
  - sau đó tự merge hoặc tự giải quyết xung đột, không cần hỏi;
  - luôn pull lại `main` ở local sau khi merge;
  - nếu không gọi được skill thì báo người dùng.
- **Quyết định:**
  - Chỉ merge khi không còn phát hiện chặn và CI bắt buộc xanh; không dùng `--admin`.
  - Không gọi được skill thì báo người dùng và không merge.
  - Xung đột đụng spec hoặc ADR đã duyệt thì hỏi.
  - Tag, release, deploy, migration lên cloud vẫn phải hỏi.
  - Không áp dụng cho PR của Dependabot.
  - Push lên nhánh PR (không phải `main`) không cần hỏi, vì cần cho việc sửa và giải quyết xung đột. Check CI còn chạy thì chờ; đỏ thì sửa hoặc chạy lại một lần, vẫn đỏ thì báo người dùng.
- **Kết quả:** PR `docs/claude-pr-review-automerge`.

## 2026-11-04 · Không cần hỏi với PR
- **Yêu cầu:** Trong dự án này, PR không cần hỏi ý kiến chủ dự án. PR #6 và #24 đã được chủ dự án tự merge. Quy tắc review và merge tự động áp dụng cho các PR từ nay về sau.
- **Quyết định:**
  - Không thêm bước hỏi riêng cho PR đụng spec, ADR hay CLAUDE.md (gợi ý của reviewer bị từ chối).
  - Bỏ "mở PR" khỏi danh sách phải hỏi.
  - Xung đột trên spec đã duyệt hoặc ADR "Chấp nhận" mà không gộp được bằng cách giữ cả hai phía thì vẫn dừng lại hỏi (bước 5, mục "Review và merge PR" trong CLAUDE.md).
- **Kết quả:** PR `docs/claude-pr-no-ask`.

## 2026-11-04 · `/kessie-skills:proj build #7 -> #15` — #7 Dependabot
- **Yêu cầu:** Làm lần lượt các issue từ #7 tới #15. Issue #7: chặn Dependabot nâng lệch phiên bản mà Expo SDK ghim, và xử lý các PR #1–#5.
- **Quyết định:**
  - Đã merge #1 và #2 (actions v7, CI xanh).
  - Đóng #3, vì `npx expo install --check` báo bộ phiên bản hiện tại đã đúng SDK 58.
  - Đóng #4 (ESLint 10) và #5 (TypeScript 7), vì làm đỏ CI và SDK chưa hỗ trợ.
  - Dependabot: bỏ qua mọi bản nâng của React/React Native do SDK ghim; với `expo*` chỉ nhận bản patch; TypeScript và ESLint bỏ qua bản major.
- **Kết quả:** PR #27.

## 2026-11-04 · `/kessie-skills:proj build #7 -> #15` — #8 Nền app
- **Yêu cầu:** Issue #8: Supabase client, biến môi trường, TanStack Query, lưu phiên an toàn, seed tài khoản E2E.
- **Quyết định:**
  - Lưu phiên bằng `LargeSecureStore` theo hướng dẫn Expo của Supabase: khoá AES-256 trong SecureStore, phiên đã mã hoá trong AsyncStorage.
  - Auto-refresh token chỉ chạy khi app ở foreground.
  - CI thêm bước `supabase db reset` để nạp seed; có test pgTAP kiểm tra seed.
- **Kết quả:** PR `feat/8-app-foundation`.

## 2026-11-04 · `/kessie-skills:proj build #7 -> #15` — #9 Schema hồ sơ
- **Yêu cầu:** Issue #9: tạo bảng `profiles`, `goals`, `user_settings` kèm RLS và test hai tài khoản.
- **Quyết định:**
  - `user_id` mặc định là `auth.uid()`; RLS chỉ có select/insert/update cho chủ sở hữu, không có policy delete (dữ liệu chỉ bị xoá theo cascade khi xoá tài khoản, #21).
  - Tuổi 13–100 kiểm bằng trigger, vì phụ thuộc năm hiện tại.
  - Giờ nhắc phải là bội số của 5 phút (check constraint).
- **Kết quả:** PR `feat/9-profile-schema`.

## 2026-11-04 · `/kessie-skills:proj build #7 -> #15` — #10 Logic dinh dưỡng
- **Yêu cầu:** Issue #10: module thuần tính BMI, BMR, TDEE, mục tiêu, ngưỡng và cảnh báo W1–W6, kèm unit test theo các ví dụ trong spec.
- **Quyết định:**
  - BMI làm tròn 1 chữ số và phân loại trên chính giá trị đã làm tròn (để khớp với số người dùng thấy).
  - Đường an toàn = round(BMR chưa làm tròn + 300).
  - W3 so mục tiêu với BMR đã làm tròn.
  - Ngưỡng đường tính theo mục tiêu calo đang dùng.
- **Kết quả:** PR `feat/10-nutrition-domain`.

## 2026-11-04 · `/kessie-skills:proj build #7 -> #15` — #11 Theme "Vở ô ly"
- **Yêu cầu:** Issue #11: token Material 3 từ bảng màu vở (sáng/tối, tắt Dynamic Color), thang chữ, spacing, cột lề 40 dp, icon tab thật.
- **Quyết định:**
  - Màu lề đỏ `#D9473F` chỉ dùng làm đồ hoạ (tương phản 4.1:1); chữ "Vượt" dùng màu `error` `#B3261E` (6.3:1).
  - Màu từng chất: đạm `#2E6E50`, natri `#8A5A00`, đường `#8E2F6E`; calo dùng màu chính.
  - Giao diện tối: nền `#17141F`, mực tím nhạt `#CDBDFF`.
  - Icon dùng Material Symbols (`menu_book`, `bar_chart`, `settings`) và SF Symbols tương ứng; dấu "!" ở lề dùng `expo-symbols`, không dùng ký tự Unicode.
  - Test tự động kiểm độ tương phản WCAG của bảng màu.
- **Kết quả:** PR `feat/11-notebook-theme`.

## 2026-11-04 · `/kessie-skills:proj build #7 -> #15` — #15 Dữ liệu ghi món
- **Yêu cầu:** Issue #15: bảng `meal_entries` và `foods`, RPC `log_meal`, truy vấn gợi ý, chuẩn hoá tên món, kèm test.
- **Quyết định:**
  - Chuẩn hoá tên ở server là nguồn sự thật: `normalize_food_name` (NFC + `unaccent` + lower + gộp khoảng trắng). `src/domain/food-name.ts` làm cùng việc đó ở client, có cùng bộ ví dụ test.
  - `log_meal`: cùng `id` thì update; gửi lại đúng request cũ thì trả về bản ghi cũ và không tăng `use_count`.
  - `suggest_foods`: tối đa 5 món, "bắt đầu bằng" xếp trước "chứa", ký tự đại diện của LIKE được escape.
  - `meal_entries`, `foods`: chủ sở hữu được select/insert/update/delete; anon không có quyền gì.
- **Kết quả:** PR `feat/15-meal-data`.

## 2026-11-04 · `tiếp tục` (`/kessie-skills:proj build #7 -> #15`) — #12 Tài khoản
- **Yêu cầu:** Tiếp tục các issue còn lại, bắt đầu từ #12: đăng ký, xác nhận email, đăng nhập, quên mật khẩu, đăng xuất, chuyển màn hình theo trạng thái phiên.
- **Quyết định:**
  - Supabase PKCE với deep link `nutritiontracker://auth/callback?code=…&next=home|reset-password`.
  - `Stack.Protected`: không có phiên → `(auth)`; có phiên nhưng chưa có hồ sơ → `onboarding` (màn tạm, #13 sẽ làm thật); có hồ sơ → `(tabs)`.
  - Đăng ký với email đã tồn tại thì báo trên trường email (ACC-02). Quên mật khẩu luôn hiện cùng một thông báo (ACC-09).
  - Supabase local bật xác nhận email, mật khẩu tối thiểu 8 ký tự.
  - Testing Library v14: `fireEvent` cũng là async (đã ghi vào CLAUDE.md).
- **Kết quả:** PR `feat/12-auth`.

## 2026-11-04 · `tiếp tục` (`/kessie-skills:proj build #7 -> #15`) — #13 Onboarding và Hồ sơ
- **Yêu cầu:** Làm #13: nhập hồ sơ lần đầu, sửa hồ sơ trong Cài đặt.
- **Quyết định:**
  - Một `ProfileForm` dùng chung cho Onboarding và Cài đặt › Hồ sơ, theo một schema zod. Số nhập dạng chữ, nhận dấu phẩy thập phân.
  - Lưu hồ sơ bằng upsert theo `user_id`. Guard ở gốc tự chuyển từ Onboarding sang tab sau khi lưu; màn tóm tắt mục tiêu để #14 làm.
  - Back trên Onboarding hỏi "Thoát app?". Rời Hồ sơ khi chưa lưu thì hỏi "Bỏ thay đổi?" (`usePreventRemove`).
  - Tab Cài đặt thành stack (`settings/index`, `settings/profile`).
  - E2E TC-E2E-04, 08; chạy `npx supabase db reset` trước mỗi lượt E2E (ghi trong test-plan). TC-E2E-05 cần màn tóm tắt nên làm cùng #14.
- **Kết quả:** PR `feat/13-onboarding`.

## 2026-11-04 · `tiếp tục` (`/kessie-skills:proj build #7 -> #15`) — #14 Mục tiêu
- **Yêu cầu:** Làm #14: tóm tắt mục tiêu cuối Onboarding, Cài đặt › Mục tiêu, cảnh báo W1–W6.
- **Quyết định:**
  - Onboarding hai bước: "Tiếp tục" chỉ kiểm tra và hiện tóm tắt; "Bắt đầu" mới lưu hồ sơ. Nhờ vậy guard ở gốc không bỏ qua màn tóm tắt.
  - Mỗi mục tiêu là "chữ đang gõ" hoặc `null` (theo gợi ý). "Dùng gợi ý" đặt về `null`; bấm "Lưu" thì ghi `null` vào `goals`. Ô trống là lỗi (GOAL-08), không phải "theo gợi ý".
  - Gợi ý và cảnh báo tính lại ngay khi gõ, bằng `computeTargets`. Ô đang gõ dở giữ giá trị đã lưu để số không nhảy.
  - Sau khi lưu vẫn ở lại màn Mục tiêu để cảnh báo còn hiện (Goals.md §3.1).
  - Thêm vai trò màu `warning` (vàng hổ phách) vào theme, có trong test tương phản. Thêm `src/domain/format.ts` để định dạng số kiểu Việt ("2.056", "22,9").
  - E2E: TC-E2E-05 nằm trong luồng Onboarding; TC-E2E-06 thêm vào `test_onboarding.py`; TC-E2E-08 kiểm tra mục tiêu đạm gợi ý đổi theo cân nặng (ACC-07).
- **Kết quả:** PR `feat/14-goals`.

## 2026-11-05 · Chuyển script E2E và chạy test (sau `/kessie-skills:proj`) — #37
- **Yêu cầu:** Chuyển thư mục `scripts/` vào `e2e/mobile-appium/` và chạy E2E trên điện thoại đã kết nối adb.
- **Quyết định:**
  - Chỉ chuyển `run-test.sh` và `run-metro.sh` vào `e2e/mobile-appium/scripts/`; `build-debug-apk.sh` ở lại `scripts/` vì `npm run build:apk` dùng chung.
  - ADR-014 thay một phần ADR-012 (vị trí script); chủ dự án duyệt khi chọn phạm vi.
  - Không sửa đường dẫn cũ trong `prompts/*.txt` và các mục LOG cũ (lịch sử).
- **Kết quả:** PR `chore/37-move-e2e-scripts`.

## 2026-11-05 · `Dùng cách build trên cloud đi` — APK E2E qua EAS
- **Yêu cầu:** Máy hết dung lượng nên không build APK local được; build APK cho E2E trên cloud.
- **Quyết định:**
  - Tạo project EAS `@antialberteinstein/nutrition-tracker`, ghi `extra.eas.projectId` vào `app.config.ts`.
  - `eas.json`: profile `e2e` (APK debug, `:app:assembleDebug`, không cần credentials, tải JS từ Metro như bản build local) và profile `preview` (APK, `appVersionSource: remote`, `autoIncrement`) theo ADR-013.
  - `build-debug-apk.sh` giữ nguyên; build cloud là lựa chọn thay thế, ghi trong `docs/testing/test-plan.md`.
  - Cả hai profile chỉ build `arm64-v8a` (`ORG_GRADLE_PROJECT_reactNativeArchitectures`): APK debug 4 kiến trúc nặng 252 MB, trong đó khoảng 215 MB là thư viện native; dex giữ nguyên vì là mã Java/Kotlin của app.
- **Kết quả:** PR `chore/23-eas-json` (Refs #23).

## 2026-11-05 · `chỉ cần 1 kiến trúc thôi … loại bỏ hoàn toàn docker-test-related trong này trước khi mở PR` — E2E không cần Docker
- **Yêu cầu:** Lượt E2E đầu tiên lỗi hết. Muốn APK chỉ một kiến trúc, và E2E không còn phụ thuộc Docker trước khi mở PR.
- **Quyết định:**
  - E2E chạy trên project Supabase cloud với tài khoản test do chủ dự án tạo (ADR-015, thay một phần ADR-011/012); pgTAP trong CI giữ Supabase local trên runner GitHub.
  - Bỏ seed `e2e-a`/`e2e-b` và test pgTAP của seed; tài khoản test đọc từ `config.json` (`testEmail`, `testPassword`), không commit.
  - Một tài khoản chỉ qua Onboarding được một lần (không có policy xoá hồ sơ); tạo tài khoản mới cho lượt sau, không nới test.
  - Conftest đưa app lên foreground trước mỗi test, lưu logcat khi lỗi; `go_to_login` không bấm Back khi app đã rời màn hình (trước đó test chạy tiếp trên launcher và app khác).
  - Lượt E2E phát hiện lỗi app: chưa đăng nhập, mở app ra "Unmatched Route" (`/` chỉ khớp `(tabs)/index` đang bị guard). Sửa ở PR riêng.
- **Kết quả:** PR `chore/23-eas-json`.

## 2026-11-05 · `bạn cứ chạy lệnh push đi` — db push lên cloud, sửa "Unmatched Route", E2E trên cloud
- **Yêu cầu:** Chủ dự án đã điền `.env.e2e` (cloud), bật xác nhận email, thêm biến môi trường cho profile EAS `preview`; cho phép `db push`.
- **Quyết định:**
  - `npx supabase db push --remote` (CLI 3 mặc định trỏ vào local), sau `--dry-run`: áp dụng hai migration, không có seed. Ghi `--remote` vào CLAUDE.md, README, WORKFLOW.
  - Sửa "Unmatched Route" khi chưa đăng nhập: `routeState` trả thêm đích `redirect` (`/login`, `/reset-password`, `/onboarding`, `/`), mọi `Stack.Protected` dùng `redirectTo`. Nhóm `(auth)` dùng `anchor` thay cho `initialRouteName` (đã bị loại bỏ, gây LogBox).
  - E2E: bật `disableIdLocatorAutocompletion` (testID của RN là resource-id không có tiền tố package); chờ màn đầu tiên tối đa 90 giây khi mở lần đầu; `by_id` dùng chung và tự cuộn; email đăng ký mới cấu hình được (`signupEmail`) vì cloud từ chối domain `.test`.
  - "Đăng xuất" ở Onboarding không ăn sau luồng Đăng ký: thanh LogBox của cảnh báo supabase-js "WebCrypto API is not supported" (PKCE rơi về `plain`) phủ lên nút. Ẩn đúng cảnh báo đó trong LogBox (chỉ bản dev); chuyển PKCE sang S256 cần `expo-crypto` (module native), đề xuất làm riêng.
  - Test cuộn tới nút trước khi đọc trạng thái hoặc bấm, và chờ cuộn dừng hẳn.
  - Kết quả trên máy thật (Supabase cloud): 7/7 test không gửi email đạt; TC-E2E-01 và TC-E2E-07 chưa chạy (cần địa chỉ email nhận được thư).
- **Kết quả:** PR `fix/12-unmatched-route`.

## 2026-11-15 · `Đã chuyển qua https://github.com/callmenguyen/nutrition-tracker` — chuyển repo
- **Yêu cầu:** Chủ dự án đã chuyển repo sang `callmenguyen/nutrition-tracker`; cập nhật repo cho khớp.
- **Quyết định:**
  - Đổi remote `origin` ở máy dev sang repo mới.
  - Sửa link người đọc bấm vào: `CHANGELOG.md`, `.github/ISSUE_TEMPLATE/config.yml`.
  - Giữ nguyên: package Android `io.github.antialberteinstein.nutritiontracker` (đổi là thành app khác), project EAS, ADR đã chấp nhận, `docs/IdeaBrief.md` và các mục cũ trong LOG (ghi lịch sử; GitHub tự chuyển hướng link cũ), `LICENSE`.
- **Kết quả:** PR `chore/repo-transfer-links`.

## 2026-11-15 · `Đổi antialberteinstein thành Nhat Nguyen` — tên chủ dự án
- **Yêu cầu:** Ghi tên chủ dự án là "Nhat Nguyen" thay cho tên tài khoản GitHub cũ.
- **Quyết định:** Đổi ở `LICENSE` (người giữ bản quyền) và `docs/IdeaBrief.md` (người quyết định). Giữ nguyên package Android, link, ADR đã chấp nhận và các mục cũ trong LOG.
- **Kết quả:** PR `chore/license-holder`.

## 2026-11-15 · `thay phần test mà có chạy backend bằng một mock node.js backend giả thay vì dùng supabase` — mock backend cho E2E
- **Yêu cầu:** Test đang chạy backend thì dùng mock backend Node.js thay cho Supabase.
- **Quyết định:**
  - Chỉ E2E Appium gọi backend thật (Supabase cloud, ADR-015); Jest đã mock sẵn, pgTAP kiểm Postgres thật nên giữ nguyên. Chủ dự án chọn: chỉ thay E2E, **bỏ hẳn** chế độ chạy trên cloud, duyệt ADR-016.
  - `e2e/mock-backend/server.ts`: TypeScript chạy thẳng bằng Node, không thêm dependency; giả lập GoTrue (signup, token password/pkce/refresh, resend, recover, user, logout, verify) và PostgREST (`profiles`, `goals`, `user_settings`), dữ liệu tách theo `user_id` trong JWT; phần chưa giả lập trả `501`; `/__test` có `reset`, `users`, `outbox`.
  - `run-test.sh` bật mock và `adb reverse` cổng 54399; `run-metro.sh` trỏ app vào mock. `conftest.py` reset mock và tạo tài khoản test ở đầu mỗi lượt; bỏ `testEmail`/`testPassword`/`signupEmail` và `.env.e2e`. TC-E2E-01/07 kiểm thêm hộp thư giả.
  - `jest.config.js` tách project `app` (jest-expo) và `mock-backend` (Node, vì jest-expo thay `fetch`); test mock dùng `supabase-js` thật.
  - Không sửa được chú thích cũ trong `.env.example` do quyền truy cập file `.env*` của agent; để chủ dự án sửa.
- **Kết quả:** issue #50, PR `chore/50-e2e-mock-backend`.

## 2026-11-16 · `/kessie-skills:proj build #16` — Tab Hôm nay
- **Yêu cầu:** Làm issue #16: tab Hôm nay với chọn ngày, thẻ tổng, danh sách món.
- **Quyết định:**
  - Chủ dự án chốt: dòng "Còn / Vượt X kcal" so với **mục tiêu**, trung tính; chỉ vượt **ngưỡng trên** (calo 4000, natri 2000, đạm/đường theo Goals.md) mới đỏ + "!" trong lề + "Vượt ngưỡng X".
  - Lịch dùng `DatePickerDialog` của `@expo/ui` (đã có trong APK). Compose chọn ngày theo nửa đêm UTC còn `selectableDates` theo ngày địa phương (đọc mã native), nên có hàm chuyển đổi riêng kèm test.
  - Ngày xem mặc định "theo hôm nay" (qua nửa đêm vẫn là hôm nay); ngày đã chọn thì giữ.
  - Mock backend thêm `meal_entries` chỉ đọc (lọc `eq`, `order`) và `/__test/meal_entries` để seed; ghi món để #17 làm cùng `log_meal`.
  - Chưa làm: FAB "+", nút "Thêm món", sheet (#17); 3 dòng Nạp/Tiêu hao/Ròng (Workout, 0.2.0). Skill `impeccable` không có sẵn nên theo brief bằng tay; direction contract ghi vào brief.
- **Kết quả:** PR `feat/16-today-tab` (Refs #16).

## 2026-11-17 · `/kessie-skills:proj build #17` — Bottom sheet thêm/sửa/xoá món
- **Yêu cầu:** Làm issue #17: sheet ghi món có gợi ý, sửa, xoá; DESIGN.md.
- **Quyết định:**
  - Sheet là `Modal` RN tự dựng (không thêm dependency); id món do client sinh (`uuidV4` từ `react-native-get-random-values`), giữ nguyên khi bấm Lưu lại sau lỗi (MEAL-17); lỗi lưu giữ sheet và dữ liệu, không cập nhật lạc quan (MEAL-16).
  - Back: IME tự đóng bàn phím trước, rồi đóng gợi ý, rồi hỏi "Bỏ món này?" nếu có dữ liệu chưa lưu.
  - `autoFocus` trong `Modal` không mở bàn phím trên Android (thấy trên máy thật): focus ô tên sau `onShow` + 250 ms.
  - Mock backend (ADR-016): `rpc/log_meal`, `rpc/suggest_foods`, xoá `meal_entries`, `/__test/foods`, `/__test/fault` (drop / drop-after) để kiểm MEAL-16/17 trên máy.
  - DESIGN.md và `.impeccable/design.json`: chủ dự án chọn cài skill impeccable rồi chạy documenter (đã cài vào `.claude/` của dự án); `.claude/` được gitignore.
  - Finish review (impeccable): sửa trong PR này "Lưu" trên bàn phím, inset thanh điều hướng, vạch lề hết trang, vị trí dấu "!", căn nút chữ. Chủ dự án chốt: **giữ font hệ thống** (không nhúng Roboto) và **lịch chọn ngày theo ngôn ngữ máy**.
- **Kết quả:** PR `feat/17-meal-sheet`.

## 2026-11-18 · `/kessie-skills:proj build #18` — Cài đặt › Món đã lưu
- **Yêu cầu:** Làm issue #18: xem, tìm và xoá món đã lưu mà không ảnh hưởng món đã ghi (MEAL-13).
- **Quyết định:**
  - Xoá bằng **bấm giữ** + hộp thoại xác nhận (spec cho phép vuốt hoặc bấm giữ; không thêm thư viện gesture); dòng gợi ý dưới tiêu đề nói cách xoá.
  - Danh sách theo tên chuẩn hoá A→Z; tìm kiếm lọc ở client bằng `normalizeFoodName` (không dùng `suggest_foods` vì giới hạn 5).
  - Không có migration mới: RLS select/delete của `foods` đã có từ #15.
  - Mock backend (ADR-016): đọc và xoá `foods` theo chủ sở hữu, kèm test Jest.
- **Kết quả:** PR `feat/18-saved-foods`.

## 2026-11-19 · Chạy E2E trên máy thật cho #18
- **Yêu cầu:** Kết nối điện thoại qua Wi-Fi và chạy E2E.
- **Quyết định:**
  - Lượt đầu lỗi toàn bộ vì Metro chưa chạy (`run-test.sh` không tự bật Metro; cần `run-metro.sh`, ADR-014).
  - `test_delete_saved_food_keeps_logged_meals` lỗi vì bấm giữ mặc định của Appium (~500 ms) trùng ngưỡng `delayLongPress` 500 ms của RN Pressable: test giữ 1,5 giây; không nới điều kiện kiểm tra.
  - Kết quả: 20/21 ở lượt đủ (chỉ test trên lỗi), sau khi sửa `tests/test_today_meals.py` 8/8 đạt.
- **Kết quả:** PR `fix/18-e2e-long-press` (Closes #18).

## 2026-11-19 · `/kessie-skills:proj build #19` — Tab Biểu đồ
- **Yêu cầu:** Làm issue #19: RPC tổng hợp theo ngày và tab Biểu đồ (CHART-01–08, 12–14).
- **Quyết định:**
  - `victory-native` ghim **42.0.1**: bản 43.x đòi Skia ≥ 2.15, còn Expo SDK 58 đi kèm `@shopify/react-native-skia` 2.14.0 (ADR-009 đã chấp nhận thêm Skia nên không cần ADR mới). Phụ thuộc native: phải build lại APK.
  - RPC `daily_totals(p_from, p_to)` (security invoker, RLS của `meal_entries`; 1–31 ngày), tải 30 ngày một lần, 7 ngày lọc ở client.
  - Màu đường mục tiêu: token mới `goal` (xanh ngả vàng, tách khỏi màu đạm); ngưỡng trên `error`; dưới / BMR / an toàn `outline` với các kiểu nét khác nhau. Ghi vào DESIGN.md.
  - Chế độ bảng (CHART-14) cũng là đường kiểm E2E vì Appium không đọc được canvas Skia; chạm dòng để chọn ngày.
  - Lỗi tải hiện lỗi + Thử lại và ẩn biểu đồ kể cả khi còn dữ liệu cũ (CHART-13).
  - "Mở ngày này": điều hướng tới Hôm nay với `?day=&at=`; Hôm nay áp dụng mỗi yêu cầu một lần.
  - Chạy trên máy thật lộ ra: nhãn ngưỡng vẽ bằng Skia mất dấu tiếng Việt → chuyển sang Text RN chồng lên canvas; chip "Natri"/"Đường" bị xuống dòng → giảm padding ngang của `ChoiceGroup` hàng ngang; chọn dòng trong bảng thì thẻ chi tiết hiện ngay dưới dòng đó.
  - Hạ tầng E2E: Appium không cài lại APK cùng versionName → `enforceAppInstall`; Metro trên ổ ngoài không nhận thay đổi → khởi động lại với `--clear` (ghi vào CLAUDE.md).
- **Kết quả:** PR `feat/19-chart`.

## 2026-11-21 · Áp dụng migration `daily_totals` lên Supabase cloud
- **Yêu cầu:** "đẩy lên đi" sau khi PR #58 (#19) merge.
- **Quyết định:** Project cloud đang tạm dừng (INACTIVE) nên `db push` hết thời gian chờ; chủ dự án bật lại project, `--dry-run` chỉ có `20261118204252_daily_totals.sql`, rồi đẩy thật; chạy lại `--dry-run` báo đã cập nhật.
- **Kết quả:** không có thay đổi trong repo ngoài mục này.

## 2026-11-21 · `/kessie-skills:proj build #20` — Nhắc ghi chép
- **Yêu cầu:** Làm issue #20: notificationScheduler và Cài đặt › Nhắc nhở (REM-01–08, REM-11).
- **Quyết định:**
  - `expo-notifications` (ADR-006, không cần ADR mới), trigger DAILY với id cố định nên lên lịch lại luôn thay cái cũ; kênh Android tạo trước khi xin quyền. Phụ thuộc native: build lại APK.
  - Chọn giờ bằng `TimePickerDialog` Material 3 của `@expo/ui` (24h); phút làm tròn xuống bội số 5 vì dial không có bước 5 phút. Đổi giờ được cả khi đang tắt (chỉ lưu).
  - Thứ tự ghi: quyền → server → lịch trên máy; lưu lỗi thì giao diện và lịch đều giữ như cũ (REM-11).
  - Dòng quyền: "Đã cho phép"; "Bị chặn trong cài đặt hệ thống" + "Mở cài đặt" khi hệ thống không cho hỏi lại hoặc người dùng vừa từ chối; chưa hỏi thì không hiện (Android 13 không phân biệt "chưa hỏi" với "từ chối một lần").
  - Tài khoản chưa có dòng `user_settings` dùng mặc định của spec §4 (tắt, 20:00), trùng default của cột.
  - Đồng bộ lịch khi mở app / quay lại foreground trong layout `(tabs)`; hủy khi `SIGNED_OUT` trong `AuthProvider`. Bấm thông báo → Hôm nay qua `?day=&at=` có sẵn từ #19.
  - Mock backend (ADR-016): `user_settings` có default khi tạo dòng, trả giờ dạng Postgres `HH:mm:ss` và từ chối phút không chia hết cho 5.
  - E2E trên máy thật (HyperOS) lộ ra `cancelScheduledNotificationAsync` không bao giờ trả về (broadcast tới `NotificationsService` không có phản hồi), làm công tắc khoá mãi: bỏ bước hủy (cùng id đã tự thay lịch cũ) và không `await` lịch trên máy trong luồng giao diện; cài đặt đã lưu là kết quả, lần đồng bộ sau áp dụng lại. Bộ lọc logcat của E2E giữ thêm tag `expo-*` và broadcast/alarm.
- **Kết quả:** PR `feat/20-reminders`.

## 2026-11-21 · `/kessie-skills:proj build #21` — Xoá tài khoản
- **Yêu cầu:** Làm issue #21: Edge Function `delete-account` và UI (ACC-11, ACC-12). Chủ dự án tạm chưa chạy được E2E trên máy.
- **Quyết định:**
  - Function xác thực JWT bằng service role, xác thực lại mật khẩu bằng `signInWithPassword` trên một client riêng, rồi `auth.admin.deleteUser` đúng id lấy từ JWT; mọi bảng xoá theo cascade (ADR-003), không cần migration.
  - Khoá lấy từ biến mặc định `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS`, `verify_jwt = false` và tự kiểm JWT (theo tài liệu Supabase về khoá kiểu mới). Mã lỗi ổn định: 401, 400, 403 `wrong_password`, 429, 500.
  - Logic ở `handler.ts` thuần, test bằng Jest (project `functions`); máy dev không có Docker nên test với Auth và cascade thật chạy ở job CI mới "Edge Functions (local Supabase)" (`npm run test:functions`).
  - UI: nút "Xoá tài khoản" màu cảnh báo (`Button tone="danger"`), hộp thoại Modal với ô mật khẩu; thành công thì đăng xuất local.
  - Mock backend (ADR-016): route `/functions/v1/delete-account` cùng hợp đồng.
  - E2E TC-E2E-20 (`tests/test_delete_account.py`) đã viết, chưa chạy trên máy.
- **Kết quả:** PR `feat/21-delete-account`.

## 2026-11-21 · Deploy `delete-account` lên cloud và chạy E2E cho #21
- **Yêu cầu:** "làm đi" (deploy function); chủ dự án chưa kiểm tay được nhưng cho phép chạy test tự động.
- **Quyết định:**
  - Trước khi deploy, kiểm (chỉ đọc tên và loại) project cloud có khoá `default` publishable và secret. Deploy `npx supabase functions deploy delete-account --remote=<ref> --yes`; function `ACTIVE`, `verify_jwt: false`.
  - Kiểm sau deploy bằng một request không token (không xoá được gì): `401 {"error":"unauthorized"}` do handler trả về (không phải `500 misconfigured`), tức là function đọc được các biến khoá trên cloud.
  - E2E `tests/test_delete_account.py` trên máy thật, với mock backend (ADR-016): 2/2 đạt. Chưa thử xoá tài khoản nào trên cloud.
- **Kết quả:** PR `docs/21-e2e-deploy`.

## 2026-11-21 · Thử nhắc nhở trên máy thật (#20): làm tròn giờ nhắc
- **Yêu cầu:** Chủ dự án báo "chỉ chọn được giờ chia hết cho 5" và không nhận được thông báo.
- **Quyết định:**
  - Bước 5 phút giữ nguyên (Reminders.md §2, check constraint của `user_settings`). Đổi cách làm tròn từ **xuống** sang **lên**: chọn 14:07 cũ thành 14:05, đã qua nên nhắc dời sang ngày mai; nay thành 14:10, vẫn trong hôm nay. 23:58 thành 00:00. Màn hình ghi rõ giờ lẻ được làm tròn lên.
  - Thông báo không đến: Metro không có cảnh báo từ `followOnDevice`, tức là lệnh lên lịch không trả về (cùng hiện tượng với lệnh hủy lúc chạy E2E). Cần logcat từ máy và kiểm "Tự khởi động" trước khi sửa tiếp.
- **Kết quả:** PR `fix/20-reminder-time-rounding`.

