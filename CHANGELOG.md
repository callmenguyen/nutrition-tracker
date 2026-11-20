# Changelog

Mọi thay đổi đáng chú ý của Nutrition Tracker được ghi tại đây. Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

<!-- Nhóm dùng trong mỗi phiên bản: ### Thêm · ### Thay đổi · ### Sửa · ### Gỡ bỏ · ### Bảo mật · ### Bảo trì · ### Ghi chú nâng cấp (migration, cần build lại, cấu hình mới) -->

## [Unreleased]

### Thêm
- Xoá tài khoản: Cài đặt › Tài khoản có nút "Xoá tài khoản"; hộp thoại nói rõ toàn bộ dữ liệu bị xoá vĩnh viễn và yêu cầu nhập lại mật khẩu. Sai mật khẩu hoặc bấm Hủy thì không xoá gì; đúng mật khẩu thì server xoá tài khoản cùng mọi dữ liệu, app về Đăng nhập ([#21](https://github.com/callmenguyen/nutrition-tracker/issues/21)).
- Nhắc ghi chép: sau Onboarding hỏi "Nhắc bạn ghi bữa ăn lúc 20:00 mỗi ngày?" (Bật / Để sau); Cài đặt › Nhắc nhở có công tắc, giờ nhắc (bước 5 phút) và trạng thái quyền thông báo kèm nút "Mở cài đặt" khi bị chặn. Thông báo được lên lịch ngay trên máy, mỗi ngày một lần, có thể đến trễ; bấm vào thì mở Hôm nay; đăng xuất thì máy đó không nhắc nữa; cài đặt lưu theo tài khoản ([#20](https://github.com/callmenguyen/nutrition-tracker/issues/20)).
- Tab Biểu đồ: tổng calo, đạm, natri, đường theo ngày trong 7 hoặc 30 ngày, dạng cột hoặc đường; ngày chưa ghi để trống (không vẽ 0); các đường ngưỡng nét đứt theo mục tiêu hiện tại; chạm một ngày để xem thẻ chi tiết và "Mở ngày này" trên tab Hôm nay; chế độ bảng cho trình đọc màn hình; lựa chọn được nhớ trên máy; số liệu tự cập nhật sau khi ghi món ([#19](https://github.com/callmenguyen/nutrition-tracker/issues/19)).
- Cài đặt › Món đã lưu: danh sách món đã lưu theo A→Z, ô tìm kiếm không phân biệt dấu; bấm giữ một món để xoá (có xác nhận). Món đã xoá không còn trong gợi ý, các món đã ghi trước đó không đổi ([#18](https://github.com/callmenguyen/nutrition-tracker/issues/18)).
- Ghi món: nút "+" và "Thêm món" mở bottom sheet nhập tên, calo, đạm, natri, đường và ngày; gõ tên thì gợi ý tối đa 5 món đã lưu (không phân biệt dấu), chọn gợi ý thì tự điền dinh dưỡng; chạm vào món để sửa hoặc xoá (có xác nhận); báo lỗi đúng trường; mất mạng thì giữ nguyên dữ liệu đã nhập, bấm Lưu lại không ghi trùng ([#17](https://github.com/callmenguyen/nutrition-tracker/issues/17)).
- Tab Hôm nay: thanh chọn ngày (‹ ›, lịch Material 3 khoá ngày tương lai, chip "Hôm nay"), khối Calo với vạch dung lượng và dòng "Còn / Vượt X kcal", ba hàng đạm, natri, đường, danh sách món theo thứ tự đã ghi; vượt ngưỡng trên thì đổi màu, có "!" trong lề và chữ "Vượt ngưỡng"; trạng thái trống, đang tải, lỗi kèm "Thử lại" ([#16](https://github.com/callmenguyen/nutrition-tracker/issues/16)).
- Mục tiêu: màn tóm tắt BMI, BMR, TDEE và mục tiêu gợi ý ở cuối Onboarding; Cài đặt › Mục tiêu để sửa mức điều chỉnh calo và tự đặt mục tiêu calo, đạm, natri, đường, có nhãn "Tự đặt · gợi ý" và nút "Dùng gợi ý"; cảnh báo W1–W6 màu vàng ngay dưới trường, không chặn lưu ([#14](https://github.com/callmenguyen/nutrition-tracker/issues/14)).
- Hồ sơ: màn nhập hồ sơ lần đầu (cân nặng, chiều cao, giới tính, năm sinh, mức vận động, mong muốn) và Cài đặt › Hồ sơ; kiểm tra giá trị ngay dưới từng trường, nhận dấu phẩy thập phân, hỏi trước khi thoát app hoặc bỏ thay đổi chưa lưu ([#13](https://github.com/callmenguyen/nutrition-tracker/issues/13)).
- Tài khoản: đăng ký, xác nhận email qua deep link, đăng nhập, quên và đặt lại mật khẩu, đăng xuất; màn hình chuyển theo trạng thái phiên và hồ sơ ([#12](https://github.com/callmenguyen/nutrition-tracker/issues/12)).
- Giao diện "Vở ô ly" trên Material 3: bảng màu sáng/tối riêng (tắt Dynamic Color), màu cố định cho từng chất, thang chữ, cột lề đỏ, icon tab Hôm nay · Biểu đồ · Cài đặt ([#11](https://github.com/callmenguyen/nutrition-tracker/issues/11)).

- Dữ liệu ghi món: lưu món đã ăn và món đã lưu trong một giao dịch, gửi lại không ghi trùng; gợi ý món không phân biệt dấu ("bun nam" khớp "Bún nạm"), tối đa 5 gợi ý ([#15](https://github.com/callmenguyen/nutrition-tracker/issues/15)).
- Dữ liệu hồ sơ, mục tiêu và cài đặt nhắc nhở trên Supabase; mỗi tài khoản chỉ đọc/ghi được dữ liệu của mình ([#9](https://github.com/callmenguyen/nutrition-tracker/issues/9)).
- Tính toán dinh dưỡng: BMI (chuẩn châu Á – Thái Bình Dương), BMR Mifflin-St Jeor, TDEE, mục tiêu và ngưỡng cho calo, đạm, natri, đường, cảnh báo W1–W6 ([#10](https://github.com/callmenguyen/nutrition-tracker/issues/10)).
- Nền app: client Supabase với phiên được mã hoá (khoá trong SecureStore), TanStack Query (mutation không tự retry) ([#8](https://github.com/callmenguyen/nutrition-tracker/issues/8)).

### Bảo trì
- E2E chạy trên mock backend Node.js trong bộ nhớ (`e2e/mock-backend/`) thay cho Supabase cloud: mỗi lượt bắt đầu với dữ liệu sạch và tài khoản test mới, email xác nhận và đặt lại mật khẩu được kiểm qua hộp thư giả; mock có test Jest dùng `supabase-js` thật (ADR-016, [#50](https://github.com/callmenguyen/nutrition-tracker/issues/50)).
- Khung repo: Expo SDK 58 (TypeScript, Expo Router, 3 tab Hôm nay · Biểu đồ · Cài đặt chưa có tính năng), Supabase local với test RLS, Jest, ESLint/Prettier, E2E Appium (Python/uv) cùng các script build APK, Metro và chạy test, CI, Dependabot.

### Ghi chú nâng cấp
- Migration mới `20261118204252_daily_totals.sql` (hàm `daily_totals`) cần áp dụng lên Supabase cloud trước khi phát hành bản có tab Biểu đồ.
- Thêm phụ thuộc native `@shopify/react-native-skia` và `victory-native`: cần build lại APK.
- Edge Function mới `delete-account` cần deploy lên Supabase cloud (`npx supabase functions deploy delete-account`) trước khi phát hành bản có nút Xoá tài khoản.
- Thêm phụ thuộc native `expo-notifications` (quyền `POST_NOTIFICATIONS`, kênh "Nhắc ghi bữa ăn"): cần build lại APK.

[Unreleased]: https://github.com/callmenguyen/nutrition-tracker/commits/main
