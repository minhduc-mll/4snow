# Vua tiếng Việt Improvement — biên bản kiểm tra

Ticket Markdown cục bộ `.scratch/vua-tieng-viet-improvements/issues/01-implement-improvement-spec.md` theo dõi [đặc tả cải thiện](./vua-tieng-viet-improvement-plan.md). [PR #3](https://github.com/minhduc-mll/4snow/pull/3) chứa lịch sử triển khai và kiểm tra.

## Môi trường

Kiểm tra ngày 18–19/11/2026 trên Windows, Chromium và PostgreSQL từ Supabase CLI 3.2.0. Stack riêng `dictionary-verification` phục vụ Edge ở `127.0.0.1:56321`. Các bộ kiểm thử tự tạo dữ liệu tổng hợp hoặc dùng fixture được lưu trong repo. Không sử dụng nguồn thật để xác nhận quyền hoặc xuất bản.

## Kết quả local

| Hạng mục | Kết quả |
| --- | --- |
| Mã nguồn | Đạt TypeScript strict, ESLint, production build, 61 bài Node, 22 bài Vitest, 2 bài Deno và kiểm tra kiểu của hai Edge entry point. Build dùng thiết lập Supabase giả lập dành riêng cho browser test. |
| Trình duyệt | Chromium với fixture đạt 54 ca. Hai ca offline chuyển sang bộ kiểm thử production và ca IME Windows cần bộ gõ thật. Kiểm tra focus, 3/5/7/9 chữ, chế độ Từ điển và Tự do, composition tổng hợp, đổi chế độ, phục hồi ván và xung đột nhiều tab. Có ca 320/375 px và reduced motion. |
| Chơi offline | Đạt hai ca tải lại ván lưu trên build production với Chromium ở trạng thái offline, một ca cho mỗi chế độ. Bộ từ phục vụ ca thử là fixture. |
| Nhập JSON | Preflight tổng hợp 10.000 mục tạo 50 phần ổn định. Ca riêng kiểm tra giới hạn byte UTF-8 và lỗi theo vị trí. Ca Chromium qua Edge và Postgres disposable làm mất phản hồi của apply/finalize sau commit rồi tải lại, đối chiếu receipt và tiếp tục. Sau khi phiên hết hạn, đăng nhập lại và tiếp tục bằng tệp gốc đã chọn trong bộ nhớ thẻ. Sau reload hoặc đăng xuất chủ động, chọn lại bộ tệp gốc để đối chiếu receipt. |
| Duyệt nhóm | Kiểm tra trên tập đóng băng 101 mục, qua hai lô, retry, giữ checkpoint, xem danh sách qua phân trang và tách mục có blocker. Suite SQL import, editorial và bulk đạt trên database mới. SQL/Edge HTTP kiểm tra token hết hạn, từ chối gọi RPC trực tiếp bằng anon, retry cùng khóa đồng thời, thay đổi payload, xung đột revision quyền nguồn và audit. |
| Bản phát hành | SQL/Edge kiểm tra hash và revision, quyền gọi RPC, retry, xung đột và con trỏ phát hành. Chromium thử ván riêng với build đã chọn và giữ save công khai. |

## Cách chạy lại

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test`, `npm run test:deno` và `npm run test:browser`.
- Chạy `npm run test:vtv:local:browser -- tests/local-browser/import.spec.ts` với Edge local. Có thể đặt `VTV_LOCAL_RUNTIME_ENV` tới tệp runtime env do CLI tạo và `VTV_LOCAL_SUPABASE_URL` tới URL loopback của stack riêng.
- Áp dụng toàn bộ migration vào stack disposable sạch. Từ thư mục chứa `output/dictionary-verification`, chạy `publication-http.integration.mjs` trước `bulk-http.integration.mjs` trong `tests/vua-tieng-viet/`. Các bài này ghi fixture và audit trên stack mang tên cố định, dùng cổng 56321. Khi chuẩn bị rollout, áp dụng migration cùng phiên bản Edge từ nhánh này vì RPC xuất bản cũ bị thu hồi quyền gọi.

## Điều kiện phát hành còn mở

- Chưa chạy Windows Telex trên bộ gõ thật, bàn phím mềm iOS/Android và trình đọc màn hình thật. Playwright kiểm tra DOM và composition tổng hợp.
- Chưa diễn tập toàn luồng 10.000 mục trên staging với một bộ dữ liệu đại diện có quyền sử dụng đã xác nhận. Kết quả preflight tổng hợp chưa đo thời gian import, duyệt, preview, xuất bản hoặc độ phản hồi của UI trên dữ liệu thật.
- Mở rộng tập accepted guesses và tuyển answer entries cần bộ nguồn đã xác minh quyền cùng quyết định biên tập. Chưa nhập, duyệt hay xuất bản nguồn thật.
