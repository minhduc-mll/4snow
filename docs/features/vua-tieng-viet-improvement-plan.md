# Vua tiếng Việt — Spec cải thiện trải nghiệm chơi và quản trị từ điển

Ngày cập nhật: 18/11/2026 (Asia/Saigon). Trạng thái: đặc tả và tiêu chí nghiệm thu. Kết quả kiểm tra triển khai được ghi trong biên bản riêng.

Đây là spec bổ sung cho [đặc tả nền](vua-tieng-viet-spec.md), chuyển các phát hiện F01–F10 của bản cải thiện thành yêu cầu có thể nghiệm thu. Các thay đổi về chế độ đoán, feedback không icon và quyết định duyệt nhóm trong tài liệu này thay thế yêu cầu cũ tương ứng khi triển khai; các ràng buộc còn lại vẫn giữ nguyên. Báo cáo gốc được giữ ở cuối để truy nguyên bằng chứng.

## Problem Statement

Người chơi bị gián đoạn nhập sau khi gửi lỗi bằng chuột, có thể nhìn thấy đáp án qua đường dẫn ghi công và khó tìm cài đặt. Tập accepted guesses nhỏ khiến nhiều từ thông dụng bị từ chối. Hướng dẫn dài trên điện thoại; icon phản hồi gây rối trong khi chỉ dùng màu lại không đủ cho người khó phân biệt màu.

Admin phải thao tác nhiều lần để nhập từng phần và mở từng dictionary candidate để duyệt. Với 10.000 mục, quy trình này không thực tế. Quyền nguồn, chất lượng nghĩa và điều kiện làm answer entry cần rõ ràng, nhưng tăng tốc không được bỏ kiểm tra nguồn, revision, audit hoặc bước xác nhận xuất bản.

Các phát hiện là bằng chứng lịch sử của lần kiểm tra được ghi trong phụ lục, không chứng minh deployment hiện tại trùng source hoặc những tính năng mới đã hoạt động.

## Solution

Cho người chơi chọn chế độ Từ điển hoặc Tự do và số chữ 3/5/7/9 trong Cài đặt. Luật cố định theo từng round; hiển thị ngay khả năng gửi, giữ focus hợp lý và khôi phục đầy đủ sau reload. Hướng dẫn ngắn, ô/phím chỉ chữ và màu, có phản hồi bằng chữ khi cần. Trong ván chỉ ghi công cấp nguồn; sau kết thúc mới mở thông tin nguồn riêng của đáp án.

Cho admin chọn bộ JSON một lần, kiểm tra trước nhập, tự chia phần, theo dõi tiến độ và tiếp tục từ receipt. Admin duyệt các nhóm đã kiểm tra bằng một quyết định rõ phạm vi, xử lý ngoại lệ riêng, xem trước rồi xác nhận dictionary release cụ thể. Một quyết định nhóm tạo quyết định có audit cho từng mục, không phải tự động duyệt khi upload.

## User Stories

1. As a người chơi, I want tiếp tục gõ sau khi gửi bằng chuột, so that không phải bấm lại ô nhập.
2. As a người chơi, I want Backspace sửa ngay sau khi bị từ chối, so that không mất mạch chơi.
3. As a người chơi, I want bấm nền hoặc bảng để tiếp tục nhập, so that dễ thao tác trên màn hình nhỏ.
4. As a người dùng bàn phím, I want Tab, Escape và shortcut hoạt động bình thường, so that focus không bị giành khỏi điều khiển tôi chọn.
5. As a người dùng bộ gõ tiếng Việt, I want hoàn tất composition trước khi gửi, so that Enter xác nhận dấu không tiêu tốn lượt.
6. As a người chơi, I want chọn Từ điển hoặc Tự do trước ván, so that chơi theo luật phù hợp.
7. As a người chơi Từ điển, I want biết từ chưa thuộc bộ từ của ván trước khi gửi, so that hiểu vì sao nút gửi bị khóa.
8. As a người chơi Từ điển, I want từ sai đáp án nhưng thuộc accepted guesses vẫn được nhận, so that có thể suy luận từ feedback.
9. As a người chơi Tự do, I want gửi mọi chuỗi chữ được hỗ trợ đủ độ dài, so that không bị độ phủ dictionary hạn chế.
10. As a người chơi Tự do, I want nhập lại chữ đã tô xám, so that luật tự do nhất quán với mô tả.
11. As a người chơi, I want số, emoji, dấu câu và độ dài sai bị từ chối, so that luật ký tự vẫn rõ ràng.
12. As a người chơi, I want chọn 3/5/7/9 chữ trong Cài đặt, so that đổi độ dài dễ tìm.
13. As a người chơi, I want xác nhận trước khi thay ván đang chơi, so that không mất tiến trình do bấm nhầm.
14. As a người chơi, I want hủy hoặc tải ván mới thất bại giữ nguyên ván cũ, so that có thể tiếp tục.
15. As a người chơi, I want ghi nhớ lựa chọn cho lần sau, so that không phải cài lại mỗi lần.
16. As a người chơi, I want save cũ và ván Tự do đều phục hồi được, so that nâng cấp không xóa tiến trình.
17. As a người chơi nhiều tab, I want xung đột được báo thay vì ghi đè, so that ván không mất lượt hoặc đổi luật âm thầm.
18. As a người chơi, I want hướng dẫn ngắn có ví dụ về dấu và chữ lặp, so that hiểu luật nhanh.
19. As a người chơi, I want ô và phím không có icon phản hồi, so that dễ đọc chữ.
20. As a người khó phân biệt màu, I want bật phản hồi bằng chữ, so that hiểu kết quả từng ô.
21. As a người dùng trình đọc màn hình, I want nghe chữ, vị trí và trạng thái ô, so that chơi được mà không cần nhìn màu.
22. As a người chơi, I want ghi công không tiết lộ mục từ đáp án khi đang chơi, so that câu đố không bị lộ qua giao diện.
23. As a người chơi, I want xem nghĩa và nguồn cụ thể sau khi kết thúc, so that học thêm từ mới.
24. As a người chơi, I want tập đoán rộng và đáp án được tuyển kỹ, so that ít gặp từ phổ biến bị từ chối hoặc đáp án quá hiếm.
25. As an admin, I want chọn nhiều phần JSON hoặc một JSON tổng một lần, so that không tải thủ công hàng chục lần.
26. As an admin, I want thấy số mục, lỗi nguồn, nghĩa, trùng và độ dài trước nhập, so that sửa dữ liệu đúng chỗ.
27. As an admin, I want tải báo cáo lỗi có vị trí mục/phần, so that xử lý ngoại lệ thuận tiện.
28. As an admin, I want tiến độ, retry và resume theo receipt/hash, so that mạng lỗi không buộc làm lại toàn bộ.
29. As an admin, I want xem quyền nguồn hiện hành tách biệt bản sửa, so that không hiểu nhầm trạng thái đã duyệt.
30. As an admin, I want duyệt quyền một lần theo phiên bản nguồn và bằng chứng, so that không lặp quyết định cho từng từ.
31. As an admin, I want phân nhóm và cảnh báo nghĩa hiếm/cổ/địa phương, so that tập trung rà nội dung cần chú ý.
32. As an admin, I want chọn hàng, trang hoặc toàn bộ kết quả lọc với số lượng chính xác, so that biết mình đang duyệt những mục nào.
33. As an admin, I want tập mục đã chọn được cố định trước xác nhận, so that dữ liệu mới không bị duyệt ngoài ý muốn.
34. As an admin, I want phân biệt cho phép đoán và cho phép làm đáp án, so that không bắt mọi từ đạt chất lượng answer entry.
35. As an admin, I want xem mẫu, phân bố và danh sách đầy đủ trước duyệt nhóm, so that đưa quyết định có căn cứ.
36. As an admin, I want mục có blocker hoặc revision cũ được báo riêng, so that không ghi đè quyết định của người khác.
37. As an admin, I want retry không nhân bản quyết định và giữ các lô đã xong, so that tiếp tục an toàn sau lỗi.
38. As an admin, I want lịch sử từng mục có lý do, batch, revision và thời gian, so that truy nguyên được thay đổi.
39. As an admin, I want preview chênh lệch release, dung lượng và số guesses/answers theo cấp, so that biết bản nào có thể xuất bản.
40. As an admin, I want thử ván preview trong ngữ cảnh riêng, so that không thay release hay save công khai.
41. As an admin, I want publish nguyên tử với revision/hash đã xác nhận, so that lỗi hoặc xung đột giữ release cũ.
42. As a người chơi đang có ván, I want giữ snapshot khi admin phát hành bộ từ mới, so that luật và đáp án không đổi giữa chừng.
43. As a người vận hành, I want bằng chứng kiểm thử trình duyệt, engine/save, HTTP/SQL và thiết bị thật, so that biết rõ giới hạn trước rollout.

## Implementation Decisions

### 1. Phạm vi, thuật ngữ và kiến trúc

- Dùng dictionary candidate, accepted guess, answer entry, normalized spelling, dictionary release và round theo glossary dự án. Chuỗi được nhận trong Tự do chỉ là lượt của round, không trở thành accepted guess đã được biên tập.
- “Đổi số lượng từ” được hiểu trong spec này là đổi số chữ 3/5/7/9 theo giả định đã ghi ở kế hoạch gốc; không thêm số lượt hoặc nhiều đáp án. Attempt limit vẫn do cấu hình release quyết định.
- Giữ Next.js App Router frontend, TypeScript strict, atoms/molecules/organisms, hooks điều phối logic. Dùng TanStack Query cho server state và invalidation; Zustand chỉ cho tương tác/UI. Không thêm server, ORM, API route hay Server Action cho tính năng này.
- Tái sử dụng engine, input/lifecycle hooks, historical save, import receipts, trusted editorial workflow và atomic publication. Bổ sung bulk trong Edge Function hiện có và transaction SQL cần thiết; không loop 10.000 request review đơn.
- Mọi request/response, props và domain model có kiểu tường minh; dữ liệu ngoài vào là unknown rồi validate. Parsing, random, storage và Edge calls có try-catch. RLS, grants và secrets giữ ranh giới hiện có; không đưa khóa đặc quyền vào browser.

### 2. Luật chơi và contract dữ liệu

| Khái niệm | Contract dự kiến |
| --- | --- |
| GuessMode | dictionary hoặc free |
| WordLevel | 3, 5, 7 hoặc 9 |
| PlayerPreferences | schema version, preferred level và guess mode; dữ liệu local có validation |
| RoundRules | mode cố định; blockAbsentLetters suy ra đúng từ mode, không cho lưu tổ hợp mâu thuẫn |
| GuessEligibility | canSubmit; normalized spelling khi hợp lệ; lý do incomplete, composing, invalid, not-in-dictionary, absent-letter hoặc unavailable khi không hợp lệ |
| Round save mới | version mới, rules và toàn bộ historical snapshot cần replay; migration save version 1 sang dictionary |

- Mặc định dictionary. Cả hai mode chuẩn hóa NFC, bỏ khoảng trắng thường, không phân biệt hoa/thường, giữ dấu; không tự bỏ ký tự sai để biến thành hợp lệ.
- Dictionary kiểm membership của snapshot và giữ luật chặn chữ đã loại. Free bỏ membership và cho nhập lại chữ xám. Hai mode dùng cùng chọn đáp án, giới hạn lượt và thuật toán xanh/vàng/xám, ưu tiên chữ đúng vị trí trước khi phân phối chữ lặp.
- Pseudo-code: chờ composition kết thúc → chuẩn hóa/validate → kiểm trạng thái ván, độ dài, chữ bị loại theo mode → kiểm membership nếu dictionary → công bố eligibility → submit kiểm lại cùng luật → evaluate và thêm lượt → lưu snapshot → điều phối focus.
- Nút gửi và Enter dùng chung validator; khóa khi loading, composition, conflict, processing hoặc terminal. Thiếu chữ hiển thị “Nhập đủ N chữ”; ngoài dictionary hiển thị “Từ này chưa có trong từ điển của ván”. Không báo lỗi giữa composition, không lộ feedback khi đang gõ, không tiêu tốn lượt khi từ chối.
- Membership tra cứu bằng Set suy ra từ snapshot, không gọi DB theo mỗi phím và không đưa bản sao server data vào Zustand. Submit lại/repeated Enter không tạo hai lượt cho một revision.

### 3. Cài đặt, phục hồi và focus

- Cài đặt nằm cạnh Cách chơi, có nhãn truy cập; hiển thị mode và số chữ đang áp dụng. Khi đổi cấu hình ván đang chơi, xác nhận rõ cấu hình mới; hủy giữ input, board, save và luật cũ.
- Tải và validate release, tạo ván mới thành công rồi mới thay state/save; thất bại giữ ván cũ và cho retry. Lựa chọn mặc định chỉ ghi nhận sau khi áp dụng thành công. Khi tiếp tục save, cấu hình trong save ưu tiên hơn preferences.
- Save version 1 hợp lệ được đọc theo luật cũ rồi migrate dictionary; không coi là hỏng chỉ vì thiếu mode. Version không biết, mode sai, rules mâu thuẫn hoặc lịch sử sai phải báo recovery thích hợp, không tự suy đoán.
- Replay lượt free theo rules snapshot kể cả chuỗi không có membership; không kiểm lại bằng release hiện hành. Cross-tab vẫn dùng revision/lock và thông báo conflict, không đổi luật giữa các lượt. Storage lỗi phải báo rõ khả năng lưu, không âm thầm xóa save còn hợp lệ.
- Sau submit còn chơi hoặc bị từ chối, phím ảo/xóa, click vùng trống/bảng: đưa focus về input, giữ nội dung/caret phù hợp và tránh cuộn. Không bắt mọi blur, không giành focus khỏi link, input khác, Tab, shortcut, modal hay picker.
- Picker chọn chữ trả focus nhập; hủy về nút mở. Modal giữ focus đúng semantics. Kết thúc ván đưa focus đến kết quả hoặc Chơi lại; không về input đã khóa. Trên điện thoại chỉ cam kết hành vi đã kiểm bằng thiết bị thật.

### 4. Hướng dẫn, feedback và ghi công

- Hướng dẫn ngắn: đoán trong N lượt theo attemptLimit; mỗi chữ có dấu là một ô; bỏ dấu cách; giải thích xanh/vàng/xám; cách nhập/chọn dấu; khác biệt hai mode và chữ bị loại. Chi tiết chữ lặp mở theo nhu cầu, không tự bật help.
- Ví dụ luật: HOA/HAI cho xanh/vàng/xám; HỌC/HỌH cho chữ H dư. Đây là ví dụ giải thích, không khẳng định thuộc release hiện hành.
- Bỏ ✓/×/↔ trên board và phím; giữ chữ, màu, ngữ nghĩa và legend. Bổ sung lựa chọn “Xem phản hồi bằng chữ” để đọc kết quả từng ô đã gửi. Giữ accessible name vị trí/chữ/trạng thái và thông báo lượt/kết quả; aria-label một mình không thay thế phản hồi nhìn thấy cho người khó phân biệt màu.
- Không tràn ngang với board 9 chữ ở 320/375 px; kiểm contrast, focus rõ, reduced motion và điều khiển khi bàn phím mềm mở. Giữ styling và component boundaries hiện có.
- Trong ván không render URL, entry ID, tooltip, accessible text hay link mục từ riêng tiết lộ đáp án. Ghi công cấp nguồn phải đáp ứng nghĩa vụ nguồn; sau thắng/thua mới hiện nguồn cụ thể. Đây là bảo vệ trải nghiệm, không chống gian lận tuyệt đối vì đáp án vẫn có trong browser.

### 5. Import và biên tập 10.000 mục

- Nhận JSON nhiều phần hoặc JSON tổng theo template có provenance. Preflight báo tổng mục, hợp lệ, độ dài sai, trùng cách viết/nghĩa, thiếu nghĩa/nguồn và xuất báo cáo vị trí lỗi. Không tự sửa từ, bỏ dấu hoặc gán quyền cleared.
- Browser chia theo cả tối đa 200 entries và 512 KiB mỗi phần, tính cả envelope JSON UTF-8. Giới hạn hiện tại là 100 phần/session. Vượt giới hạn thì báo rõ trước upload; tự nối nhiều session không phải yêu cầu bắt buộc của lần này. Một entry quá lớn cần lỗi riêng, không cắt nội dung nghĩa.
- Một lần bắt đầu chạy hàng đợi có tiến độ; retry/resume đối chiếu hash/receipt với backend, không tin checkpoint local. Thiếu phần hoặc nội dung cùng key khác hash không được finalize. Mất phiên admin dừng request mới, giữ tiến độ đã xác nhận, yêu cầu đăng nhập lại trước tiếp tục.
- Phân trang/lazy detail hoặc virtualize; không render 10.000 form. Phân nhóm hỗ trợ, không tự quyết định chất lượng ngôn ngữ. Cảnh báo nghĩa có “hiếm”, “cổ”, “địa phương” khi gán common; admin phải rà lại trước chọn answer entry.
- Quyền nguồn hiển thị quyết định hiện hành, bằng chứng, phạm vi và phiên bản riêng với bản sửa. Form khởi tạo từ quyết định hiện hành, hủy không đổi dữ liệu; thay đổi metadata/phiên bản nguồn cần review lại. Không lặp quyền cho từng mục cùng phiên bản.
- Tập accepted guesses rộng hơn tập answer entries; đáp án phải có nghĩa tiếng Việt đã duyệt và đạt điều kiện hiện có. Thiếu quyền, cấu trúc sai, thiếu nghĩa đáp án, exclusions hoặc collision chưa giải quyết là blocker tương ứng; bulk không bỏ qua.

### 6. Contract bulk tin cậy và audit

- Chọn hàng/trang/tất cả bộ lọc phải tạo tập ID/revision cố định phía tin cậy trước xác nhận. Snapshot giữ filter, số lượng, draft/source revision và hash; admin xem mẫu, phân bố, danh sách đầy đủ và các blocker. Mục mới không tự tham gia snapshot đã xác nhận.
- Request áp dụng gồm selection ID/hash, batch ID, idempotency key, expected draft revision, targets có entry ID/expected entry revision, quyết định, category/answer eligibility, exclusion checks và rationale. Backend validate auth và từng giá trị; không chấp nhận client tự khẳng định đã kiểm quyền.
- Response có receipt, revision sau xử lý, checkpoint, số lượng và kết quả từng mục: applied, unchanged, conflict hoặc invalid, kèm lý do có kiểu. Lỗi envelope/auth không ghi dữ liệu. Mục conflict/invalid không đổi; mục hợp lệ có kết quả bền vững và audit tương ứng. Transaction phải làm receipt và thay đổi của batch nhất quán.
- Tối đa khởi đầu 100 mục/request; điều chỉnh trong khoảng 100–200 chỉ sau benchmark và cập nhật contract/test. Giới hạn byte và rate limit được kiểm phía tin cậy bằng cơ chế hiện có; không nhận lô vô hạn.
- Các batch chạy tuần tự với expected draft revision trả về từ receipt trước. Entry revision trong selection vẫn giữ nguyên. Thay đổi xen ngang từ admin khác gây conflict và yêu cầu rà lại phần chưa chạy; không tự lấy revision mới để ghi đè.
- Retry cùng key/payload trả lại receipt, không thêm quyết định. Cùng key khác payload bị từ chối. Mất response sau commit được khôi phục bằng receipt. Batch sau lỗi không xóa batch trước; resume bỏ qua phần đã thành công.
- Audit append-only từng mục: revision trước/sau, input/output/config, rationale, timestamp, batch/selection ID và actor role. Role admin của tài khoản chung không được diễn giải là danh tính cá nhân. Sửa sai bằng quyết định mới; nếu đã publish phải có release mới, không sửa lịch sử.
- Schema bổ sung selection, liên kết batch/receipt và audit theo migration append-only, giữ dữ liệu private; anon/authenticated không được đọc draft, ghi quyết định hoặc gọi routine đặc quyền trực tiếp. Không có fallback browser ghi DB để né Edge.

### 7. Preview và publication

- Preview cho biết số thêm/loại so với release hiện hành, guesses/answers từng cấp, dung lượng serialized, nguồn và blocker. Cho thử ván trong ngữ cảnh preview riêng, không dùng khóa save của player và không cập nhật con trỏ public.
- Giữ giới hạn hiện tại 2 MiB payload, 20.000 guesses/cấp, 2.000 answers/cấp; 10.000 candidates không đồng nghĩa 10.000 đáp án hay một release chắc chắn vừa. Không tăng giới hạn chỉ để làm demo pass.
- Publish chỉ sau admin xác nhận build cụ thể còn đúng revision/hash. Transaction đổi pointer nguyên tử; lỗi giữ release cũ, publish trùng trả receipt cũ, preview stale buộc dựng lại. Ván cũ giữ snapshot; ván mới lấy release mới.
- Pseudo-code admin: preflight → queue import/receipt → review quyền nguồn → cố định selection → xem nhóm/blocker → xác nhận quyết định → apply batch/audit → resume có kiểm soát → preview → thử riêng → xác nhận publish.

## Testing Decisions

Người dùng đã yêu cầu thêm đầy đủ kiểm thử trình duyệt, engine/save, HTTP/SQL thật và IME/điện thoại thật. Dùng luồng trình duyệt làm seam chính; giữ các seam engine/save và trusted boundary hiện có cho trường hợp không thể chứng minh chỉ qua UI. Không tạo abstraction chỉ để test.

Test tốt kiểm hành vi quan sát được, dữ liệu lưu và quyền bị từ chối; không assert hook call order, state private hay snapshot sao chép implementation. Fixture tổng hợp cố định phục vụ tự động, dữ liệu có nguồn thật phục vụ nghiệm thu release; không trộn hai loại bằng chứng.

| Nhóm | Tiêu chí nghiệm thu bắt buộc | Prior art trong repo |
| --- | --- | --- |
| Browser player | Focus sau lỗi/lượt hợp lệ/phím ảo; nền; Tab/modal/picker; composition Enter; submit lặp; đổi mode/số chữ hủy/thành công/lỗi; thắng/thua/replay | word-input, word-game, word-layout |
| Browser luật mới | AAA bị khóa trong dictionary khi không thuộc membership, được nhận trong free; Enter không vượt validator; free nhập chữ xám; không có feedback trước gửi | word-input, word-game |
| Engine | NFC/NFD, dấu, khoảng trắng, chữ lặp, keyboard precedence, ký tự sai, mọi độ dài; mode không đổi cách đánh giá; boundary attempt limit | player, contract, configuration |
| Save/cross-tab | Migrate v1; roundtrip free; replay snapshot cũ sau publish; preference khác save; malformed/unknown version; storage/quota lỗi; conflict và concurrent replace không ghi đè | round-save, cross-tab, word-persistence, word-cross-tab |
| Browser admin | Chọn file một lần, preflight, tiến độ/resume, hết phiên, chọn xuyên trang, số lượng cố định, blocker riêng, quyền hiện hành khác bản sửa, preview thử riêng | dictionary-preview, dictionary-publication, admin-session |
| HTTP/SQL thật | Auth sai/hết hạn, RLS và grants với anon/authenticated; bulk validation; same-key retry/payload khác; stale entry/draft/source revision; rate limit; mất response sau commit; audit/receipt nhất quán | local-supabase, local-runtime, local-sql, rights-review, editorial, HTTP Deno |
| Publication thật | Thiếu cấp/quyền/nghĩa, collision, answer ngoài guesses, quá 2 MiB, preview stale, publish đồng thời, pointer nguyên tử, ván cũ tiếp tục | publication HTTP/SQL, collision SQL, configuration SQL |
| Accessibility | Không icon; đọc feedback bằng chữ; screen reader thật; focus/keyboard; contrast; reduced motion; board 9 chữ tại 320/375 px | word-layout, word-input và kiểm tra thủ công |
| Thiết bị thật | Windows IME tiếng Việt/Telex, iOS và Android: composition, Enter, Backspace, picker, focus/scroll và bàn phím mềm | word-native-ime cộng biên bản thiết bị thật |
| Offline thật | Ván đã lưu tiếp tục đủ hai mode, reload từ cache khi hỗ trợ, không tạo ván từ release chưa tải; lỗi mạng/retry giữ save | offline-shell, word-persistence và production-build smoke |
| 10.000 mục | Dataset đại diện có provenance; ngắt/resume, retry không nhân bản, bulk nhiều trang, conflict, lỗi batch, hết phiên, oversized preview và exception routing | Các suite import/editorial/publication + rehearsal staging |

- Ghi rõ môi trường, commit frontend, migration/function version, dataset/hash, thiết bị/trình duyệt, thao tác, kết quả và giới hạn mỗi lần chạy. Browser mock không chứng minh auth/RLS; Unicode injection không chứng minh IME thật; viewport giả lập không thay thiết bị thật.
- Benchmark 10.000 mục đo thời gian preflight/import/review/preview, request count, kích thước release/save, lỗi/retry và responsiveness. Chưa đặt SLA thông lượng khi chưa có baseline. Mục tiêu UX: không phải chọn file 50 lần hoặc mở 10.000 form; tập lớn vẫn tương tác được.
- Khi triển khai: typecheck, lint và build phải pass; chạy các suite Node/Vitest, Playwright, Deno và HTTP/SQL liên quan trên môi trường disposable/staging xác định. Kiểm tra hồi quy admin login, Quiz/Lucky Draw theo phạm vi ảnh hưởng. Không nâng báo cáo lịch sử thành kết quả mới.
- Nếu chưa có thiết bị thật hoặc staging phù hợp, ghi gate chưa đạt; không coi toàn bộ nghiệm thu hoàn tất chỉ vì automated suite pass.

## Out of Scope

- Triển khai code, chạy upload/review/publish thật hoặc rollout trong lượt viết spec này.
- Player accounts, multiplayer, leaderboard, timed/daily puzzle, chống gian lận/giữ bí mật đáp án tuyệt đối.
- Cài đặt số lượt đoán cho player, nhiều đáp án một ván, độ dài ngoài 3/5/7/9.
- CSV/XLSX, scraping nguồn, tự sinh nghĩa, tự duyệt quyền/chất lượng hoặc tự publish.
- Tự nâng giới hạn payload/session, cam kết xuất bản 10.000 answer entries, SLA chưa đo.
- Xóa audit, rollback lịch sử, định danh admin cá nhân hay thay cơ chế đăng nhập hiện hành.
- Refactor không liên quan, đổi hành vi Quiz/Lucky Draw, thêm gameplay Realtime hoặc backend ngoài kiến trúc cho phép.

## Further Notes

- Trình tự: (1) focus/ghi công; (2) mode/cài đặt và save migration cùng nhau; (3) hướng dẫn/accessibility; (4) import/bulk tin cậy; (5) chất lượng dictionary và rehearsal 10.000 mục. Có thể kiểm thử mỗi phần độc lập, nhưng nghiệm thu tổng phải đủ các gate trên.
- Cập nhật đồng bộ gameplay requirements, đặc tả nền và dictionary requirements khi triển khai để không còn luật cũ mâu thuẫn. Không đánh dấu các ticket lịch sử đã giải quyết chỉ từ spec này.
- Các điểm còn là giả định/tham số: “số lượng từ” là số chữ; batch 100 là mức khởi đầu chưa benchmark; độ phủ từ cụ thể cần dữ liệu nguồn có quyền và review. Mode Tự do không thay việc mở rộng accepted guesses.
- Issue tracker là Markdown cục bộ theo cấu hình dự án. `.scratch/vua-tieng-viet-improvements/issues/01-implement-improvement-spec.md` trỏ về spec này, không sao chép thành spec thứ hai.
- Lượt viết spec chỉ đối chiếu repository và bảo toàn báo cáo gốc; chưa chạy lại hành vi deployment. Đã tham khảo [Supabase changelog](https://supabase.com/changelog.md) theo workflow skill; không dùng nó để suy ra năng lực bộ dữ liệu hoặc thay đổi API.

### Phụ lục — Bản đánh giá gốc để truy nguyên

Nội dung dưới đây được giữ nguyên từ trước lần chuyển thành spec. Các câu “đã kiểm tra”, “đã bấm”, “chưa kiểm tra” chỉ mô tả lần khảo sát gốc. Các đề xuất trong phụ lục được cụ thể hóa bởi phần spec ở trên; nếu khác nhau, phần spec được ưu tiên.

<details>
<summary>Mở bản đánh giá và kế hoạch cải thiện ban đầu</summary>

# Vua tiếng Việt — Đánh giá và kế hoạch cải thiện

Ngày: 18/11/2026 (Asia/Saigon). Trạng thái: đề xuất, chưa triển khai.

Tài liệu tổng hợp hai lượt kiểm tra người chơi/admin và các yêu cầu bổ sung của người dùng. Không coi đọc code hoặc báo cáo kiểm thử cũ là bằng chứng đã chạy thành công trên deployment hiện tại.

## 1. Kết luận và phạm vi

Các yêu cầu đều khả thi trong kiến trúc hiện tại: Next.js frontend, Supabase cho dữ liệu, Edge Functions cho thao tác quản trị tin cậy. Không cần thêm Next.js API route, Server Action, ORM hoặc server Node/Python.

- Ưu tiên sửa mất focus, lộ đáp án qua ghi công và bổ sung cài đặt chơi.
- Cần mở rộng từ được chấp nhận; chế độ tự do giúp chơi được nhưng không thay thế chất lượng dictionary.
- Với 10.000 mục, cần nhập tự động theo phần và duyệt theo nhóm có kiểm soát; không yêu cầu mở từng mục để bấm duyệt nếu cả nhóm đã được người quản trị kiểm tra theo cùng tiêu chí.
- Bỏ biểu tượng đúng/sai trên ô và phím theo yêu cầu mới. Giữ thông tin truy cập và cung cấp cách đọc phản hồi không phụ thuộc hoàn toàn vào màu.
- Hiểu tạm “đổi số lượng từ” là đổi số chữ của đáp án: 3/5/7/9. Chưa hiểu thành số lượt đoán hoặc nhiều đáp án trong một ván. Nếu ý định khác, cần điều chỉnh phạm vi này trước triển khai.

Chỉ tạo tài liệu này. Không sửa code, tải tệp lên admin, lưu duyệt, đổi cấu hình hoặc xuất bản release. Đã bấm tạo bản xem trước admin: thao tác này tạo bản dựng xem trước; không thay release hiện hành.

## 2. Môi trường và bằng chứng

- Người chơi: https://4snow-md.vercel.app/vua-tieng-viet
- Admin: https://4snow-md.vercel.app/admin#dictionary; sử dụng phiên đăng nhập đã có, không đọc hoặc thay thông tin đăng nhập.
- Trình duyệt trong Codex trên máy Windows; kiểm tra desktop và viewport 375×812, 320×740. Viewport mô phỏng không phải điện thoại thật.
- Repository: nhánh `feat/vua-tieng-viet-ui`, HEAD `c13e4f7`, package `0.1.0`; lockfile Next.js `16.2.4`, React `19.2.5`.
- Chưa xác định commit/build của deployment. Có chi tiết UI deployed khác source local, chẳng hạn lời nhắc mất thay đổi chưa lưu trong trang duyệt. Không mặc định chúng đồng nhất.
- Git trước kiểm tra: sửa sẵn `docs/features/vua-tieng-viet-dictionary.md`, `docs/supabase.md`; chưa theo dõi `.worktrees/`, `data/vua-tieng-viet/bang-duyet-ung-vien.md`, `docs/features/vua-tieng-viet-sources/README.md`. Giữ nguyên các mục này.
- Đã đọc AGENTS.md, README, shared requirements, gameplay requirements, dictionary requirements, implementation specification và các kế hoạch/ghi nhận input, player, release readiness.
- Không dùng dữ liệu giả lập trong các lần chơi và xem admin. Chuỗi không phải từ như `zzz` là đầu vào kiểm tra trên dữ liệu thật, không phải mock backend.

### 2.1. Người chơi đã thực sự kiểm tra

| Kiểm tra | Kết quả quan sát |
| --- | --- |
| Mở ván 3/5/7/9 chữ | Thành công ở cả bốn độ dài, 6 lượt mỗi ván |
| Hướng dẫn | Đọc desktop/mobile; có luật dấu, chữ lặp, picker, lưu ván; khá dài trên điện thoại |
| Nhập có dấu và xóa | Nhập Unicode, Backspace, xóa ảo hoạt động khi input có focus |
| Bàn phím ảo | Nhập N/G; chọn Ế; nhóm E có 12 biến thể; chọn Đ bằng Tab/Enter, Escape đóng picker |
| Gửi | Thử Enter và nút gửi; thiếu chữ thì nút bị khóa |
| Từ không hợp lệ | `zzz` bị từ chối, giữ nội dung, không mất lượt |
| Độ phủ | `con`, `bàn`, `mèo`, `hoa` (3), `học sinh` (7), `tiếng Việt`, `điện thoại` (9) bị từ chối |
| Thắng | `hỏi`, `hàn vi`, `dĩnh ngộ`, `nghiên cứu` thắng; thấy nghĩa và số lượt |
| Sai hợp lệ và chữ lặp | Gửi `nghiên cứu` cho đáp án `nhà hóa học`: N đầu xanh, N dư xám, H/C vàng; phím N vẫn dùng được |
| Chữ bị loại | Nhập G sau lượt trên bị chặn, có thông báo |
| Unicode và khoảng trắng | `tiếng Việt` điền chín ô; `nhà hóa học` dạng NFD vẫn thắng ở lượt 2 |
| Reload | Giữ nội dung chưa gửi; giữ lượt sai, feedback và số lượt đã gửi |
| Chơi lại | Ván 9 chữ mới mở được; đã gặp đáp án khác. Hộp xác nhận bỏ ván và hủy xác nhận hoạt động |
| Responsive | Bảng 9 chữ không tràn ngang ở 320 px; focus hiển thị rõ |
| Focus sau lỗi | Gửi `zzzzzzzzz` bằng chuột: focus ở BUTTON “Gửi đáp án”; Backspace không thay đổi input |

Các lần đoán đúng sử dụng từ nhìn thấy trong URL ghi công để kiểm chứng việc lộ đáp án, không phải bằng chứng người mới tự giải được câu đố.

### 2.2. Admin đã thực sự kiểm tra

1. Mở Từ điển → Nhập: một bộ chọn JSON, nhãn tối đa 512 KiB; các nút Bắt đầu/tiếp tục, Tải phần này lên, Hoàn tất nhập. Chưa chọn tệp hoặc chạy nhập.
2. Mở Duyệt: quan sát bộ lọc nguồn, số chữ, trạng thái, có nghĩa, trùng cách viết; danh sách 12 mục đã duyệt, Trang tiếp bị khóa. Không có lựa chọn hàng loạt trong UI quan sát được.
3. Mở `dĩnh ngộ`: xem lựa chọn nghĩa đáp án, quyền nguồn, biểu mẫu từng mục, các điều kiện loại trừ và lịch sử. Không sửa/lưu trường nào.
4. Mục trên có nghĩa ghi “(hiếm)” nhưng phân loại đang là “Thông dụng”, đủ điều kiện làm đáp án. Đây là mâu thuẫn dữ liệu quan sát được, chưa chứng minh thuật toán tự phân loại sai.
5. Mở Xuất bản → Làm mới bản xem trước: thành công, “Sẵn sàng xuất bản”; không bấm Xuất bản.

| Độ dài | Từ chấp nhận trong bản xem trước | Đáp án trong bản xem trước |
| --- | ---: | ---: |
| 3 | 3 | 3 |
| 5 | 3 | 2 |
| 7 | 3 | 3 |
| 9 | 3 | 3 |

Bản xem trước: 6 lượt, 1 nguồn, 12 mục ghi công; build `3b38219a-c766-4df6-a0a4-4ce6af75b5a4`. Đây là dữ liệu nháp được dựng lúc kiểm tra, chưa đối chiếu release ID để khẳng định chính là release đang phục vụ. Kết quả từ thông dụng bị từ chối ở player là bằng chứng độc lập về tập từ đang chơi.

## 3. Danh sách cải thiện ưu tiên

P1: ảnh hưởng trực tiếp khả năng chơi/quản trị; P2: cải thiện khả dụng và chất lượng.

| ID | Ưu tiên | Vấn đề/yêu cầu | Cơ sở | Kết quả cần đạt |
| --- | --- | --- | --- | --- |
| F01 | P1 | Mất focus sau gửi bị từ chối | Tái hiện trên trình duyệt | Gõ/xóa tiếp ngay, không cần bấm lại input |
| F02 | P1 | Link ghi công lộ đáp án | Mở Cách chơi → URL mục nguồn → nhập từ đó thắng | Không lộ mục từ đáp án trong lúc chơi |
| F03 | P1 | Chế độ từ điển/tự do; kiểm tra trước gửi | Yêu cầu mới; hiện chỉ kiểm tra membership khi submit | Chọn luật rõ ràng, chặn từ không hợp lệ trước gửi |
| F04 | P1 | Nhập/duyệt 10.000 mục | UI từng mục, giới hạn code | Nhập tự động theo phần, quyết định theo lô, xử lý ngoại lệ riêng |
| F05 | P1 | Tập từ chấp nhận quá nhỏ | Từ phổ biến bị từ chối; preview chỉ 3 từ/cấp | Tập đoán rộng hơn tập đáp án, có kiểm tra độ phủ |
| F06 | P2 | Cài đặt và đổi 3/5/7/9 chữ | Yêu cầu mới; hiện thao tác ván mới nằm trong hướng dẫn | Cài đặt dễ tìm, xác nhận khi thay ván |
| F07 | P2 | Hướng dẫn ngắn, ví dụ thật | Hộp hướng dẫn dài trên mobile | Đọc nhanh, ví dụ trực quan, chi tiết mở rộng |
| F08 | P2 | Bỏ ✓/×/↔ trên ô và phím | Yêu cầu mới | Chỉ hiện chữ và màu ở giao diện mặc định |
| F09 | P2 | Từ hiếm được chọn làm đáp án thông dụng | `dĩnh ngộ` có nhãn nghĩa hiếm, category common | Cảnh báo mâu thuẫn, rà độ thông dụng trước chọn đáp án |
| F10 | P2 | Trạng thái quyền hiện tại và form mới gây nhầm | “Đã cho phép” nhưng select chỉnh sửa mặc định “Chưa giải quyết” | Tách lịch sử, quyết định hiện hành, hành động thay đổi |

## 4. Đặc tả đề xuất cho người chơi

### 4.1. Focus liên tục trong thao tác chơi

Khả thi. Source `useWordInput.ts` hiện focus khi roundId/guessCount đổi; khi submit lỗi không đổi số lượt nên đường phục hồi này không chạy. Đây là giải thích phù hợp với lỗi đã tái hiện.

- Sau gửi hợp lệ nhưng chưa kết thúc, gửi bị từ chối, bấm phím ảo/xóa: trả focus về input đang chơi, giữ nội dung/caret thích hợp, tránh cuộn trang ngoài ý muốn.
- Click vùng trống hoặc bảng chơi: đưa focus vào input khi ván đang hoạt động.
- Không triển khai vòng lặp ép focus toàn trang hoặc bắt mọi blur. Cho phép Tab đến nút, đọc/chọn văn bản, mở link, thao tác cài đặt/hướng dẫn/picker. Modal giữ focus bên trong; sau đóng về vị trí phù hợp theo cách đóng và thao tác tiếp theo.
- Không cướp focus khỏi input khác, không phá Ctrl/Cmd shortcuts hoặc IME composition. Không tự submit Enter đang xác nhận dấu.
- Ván thắng/thua: focus tới kết quả hoặc Chơi lại, không vào input đã kết thúc.
- Trên điện thoại: gọi focus trong thao tác người dùng khi phù hợp; không cam kết bàn phím mềm luôn bật trên mọi trình duyệt trước khi kiểm thử thiết bị thật.

Nghiệm thu: chuột gửi từ sai → Backspace sửa ngay; gửi đúng một lượt → gõ lượt tiếp; click nền → gõ; Tab/Escape/modal vẫn dùng được; không giật cuộn, không mất dấu tiếng Việt.

### 4.2. Chế độ gửi đáp án

Hai lựa chọn trước ván, mặc định đề xuất là Từ điển để bảo toàn hành vi hiện tại:

| Chế độ | Điều kiện nhận lượt | Ví dụ |
| --- | --- | --- |
| Từ điển | Đủ số chữ, ký tự hợp lệ và thuộc tập từ chấp nhận của release gắn với ván | AAA bị từ chối nếu không có trong tập |
| Tự do | Đủ số chữ và ký tự được hỗ trợ; không cần có nghĩa hoặc nằm trong dictionary | AAA được gửi trong ván 3 chữ, tiêu tốn một lượt và nhận feedback |

“Từ điển” không có nghĩa phải đoán đúng đáp án mới được gửi. Đáp án sai nhưng là từ trong tập vẫn phải được nhận lượt. Chỉ so sánh với tập công khai đã xuất bản, không đối chiếu draft/private candidates.

Có thể khóa nút gửi trước khi bấm: chuẩn hóa Unicode rồi kiểm tra tập membership của snapshot ván ngay tại browser. Không gọi database theo mỗi phím; cơ chế này vẫn dùng được khi phục hồi offline. Cache một Set suy ra từ snapshot để tra cứu; không sao chép server state vào Zustand.

- Hiện “Nhập đủ N chữ” khi thiếu; khi đủ nhưng ngoài dictionary, hiện “Từ này chưa có trong từ điển của ván” và vô hiệu nút gửi.
- Không báo lỗi giữa composition; Enter và nút gửi dùng cùng validator, kể cả khi có thể gọi submit theo cách khác.
- Chỉ báo khả năng gửi, không tiết lộ chữ đúng/sai trước khi gửi.
- Tự do vẫn chặn số, emoji, dấu câu và độ dài sai; giữ quy tắc dấu/hoa-thường/khoảng trắng. Không biến chuỗi tự do thành dữ liệu từ điển đã duyệt.
- Để “bất cứ chuỗi chữ nào” có ý nghĩa nhất quán, đề xuất chế độ Tự do vẫn tô xám chữ đã loại nhưng cho nhập lại chúng; chế độ Từ điển giữ luật chặn chữ đã loại hiện tại. Ghi rõ khác biệt này trong cài đặt.
- Chế độ không thay đổi đáp án được chọn hay cách tính xanh/vàng/xám.

Chế độ phải gắn cố định với ván. Thay đổi giữa ván cần xác nhận bắt đầu ván mới; hủy thì giữ nguyên. Chỉ thay ván sau khi tải thành công. Không đổi luật của các lượt cũ.

Phải cập nhật schema save, validator phục hồi và kiểm tra chéo tab: hiện `round-save.ts` phát lại lượt qua `submitGuess`; nếu chỉ bỏ kiểm tra ở UI thì lượt AAA sẽ không phục hồi được. Save cũ được migration rõ ràng sang chế độ Từ điển; không coi save hợp lệ cũ là hỏng chỉ vì thêm setting.

### 4.3. Cài đặt và đổi số chữ

- Đặt nút Cài đặt cạnh Cách chơi, có nhãn truy cập.
- Chứa chế độ gửi và số chữ 3/5/7/9; hiển thị thiết lập đang áp dụng trên màn chơi.
- Chọn số chữ/chế độ khi đang chơi → xác nhận “Bắt đầu ván mới với …?” → tải release → thay ván nguyên tử; lỗi thì giữ bảng và save cũ, có thử lại.
- Lưu lựa chọn mặc định cho lần chơi sau; cấu hình ván đã lưu được ưu tiên khi tiếp tục ván.
- Số lượt đoán vẫn theo cấu hình đã xuất bản của admin. Không tự thêm cài đặt số lượt cho player khi chưa xác nhận ý nghĩa “số lượng từ”.

### 4.4. Hướng dẫn ngắn và không có icon phản hồi

Nội dung gợi ý, với N lấy từ attemptLimit thực tế:

> Đoán từ tiếng Việt trong N lượt. Mỗi chữ có dấu chiếm một ô; bỏ qua dấu cách.
> Xanh: đúng vị trí. Vàng: đúng chữ, khác vị trí. Xám: không có hoặc đã dư.
> Gõ bằng bàn phím hoặc chọn dấu trên màn hình. Điền đủ ô rồi gửi.
> Chế độ Từ điển chỉ nhận từ có trong bộ từ của ván; Tự do nhận mọi chuỗi chữ đủ độ dài.

Ví dụ minh họa bằng từ thật: đáp án HOA, đoán HAI → H xanh, A vàng, I xám. Ghi rõ đây là ví dụ luật, không bảo đảm HOA/HAI có trong release hiện hành. Mục “Xem thêm: chữ lặp” dùng đáp án HỌC, đoán HỌH → H đầu xanh, Ọ xanh, H cuối xám. Các ô chỉ chữ và màu, không ✓/×/↔.

- Bỏ icon trên cả board và phím ảo, không xóa trạng thái ngữ nghĩa hoặc thuật toán.
- Giữ accessible name như “Ô 2: A, khác vị trí”, thông báo số lượt/kết quả cho trình đọc màn hình.
- Có lựa chọn “Xem phản hồi bằng chữ” dưới hàng đã gửi hoặc chế độ tương phản/viền phân biệt; không đưa icon trở lại mặc định. Chỉ aria-label không đủ phục vụ người nhìn được nhưng khó phân biệt màu.
- Chú thích ba màu ngắn luôn dễ tìm; hướng dẫn chi tiết, nguồn và thông tin kỹ thuật không trộn thành một đoạn dài.

### 4.5. Chống lộ đáp án và chất lượng từ

Trong ván chỉ hiển thị ghi công cấp nguồn phù hợp; không hiển thị URL/entry ID riêng của đáp án. Sau kết thúc mới hiển thị mục nguồn cụ thể. Rà yêu cầu ghi công của nguồn để chọn cách trình bày phù hợp. Đây là sửa UX; không tuyên bố chống gian lận tuyệt đối vì game casual tải đáp án về browser theo thiết kế.

Tập từ được phép đoán nên rộng, tập đáp án nên ưu tiên từ phổ biến có nghĩa rõ. Admin cần cảnh báo các nghĩa chứa dấu hiệu “hiếm”, “cổ”, “địa phương” khi bị gán thông dụng; cảnh báo là hỗ trợ biên tập, không tự kết luận đúng/sai ngôn ngữ.

## 5. Thiết kế luồng admin cho 10.000 mục

### 5.1. Nút thắt hiện tại đã xác định từ source

- Một file JSON mỗi lần chọn; tối đa 512 KiB và 200 entries/phần; tối đa 100 phần/session. Một mục có thể là một nghĩa, không nhất thiết một cách viết duy nhất.
- 10.000 entries cần ít nhất 50 phần nếu mỗi phần đủ 200 và vừa giới hạn byte; nội dung dài có thể cần nhiều hơn. Giới hạn số lượng không chứng minh toàn bộ bộ dữ liệu sẽ vừa.
- UI danh sách gọi 50 mục/trang: 10.000 mục tương đương 200 trang nếu duyệt hết. Không có bulk selection/action trong UI/source đã đọc.
- Review API nhận một entryId và revision, cùng quyết định/loại/điều kiện loại trừ; chưa có endpoint duyệt lô.
- Import, review, rights và chọn nghĩa là các bước riêng; quyền nguồn gắn theo nguồn nhưng biểu mẫu nằm trong chi tiết từng từ.
- Payload công khai có giới hạn 2 MiB, tối đa 20.000 guesses/cấp, 2.000 answers/cấp trong validator hiện tại. 10.000 mục nhập không đồng nghĩa có thể xuất bản 10.000 đáp án; cả bốn cấp tối đa 8.000 answers theo giới hạn này, còn dung lượng có thể chặn sớm hơn.

Không nâng mọi giới hạn tùy tiện. Cần đo dữ liệu thật có nghĩa/ghi công, dung lượng snapshot, thời gian chuẩn hóa và chi phí tải trên điện thoại trước khi thay contract.

### 5.2. Luồng đề xuất

1. **Chọn bộ dữ liệu:** chọn nhiều phần một lần hoặc một file tổng theo template có nguồn gốc; browser tự chia phần theo cả số entries và byte. Hỗ trợ JSON trước; CSV/XLSX là mở rộng tùy chọn với mapping trường và nguồn, không thuộc yêu cầu bắt buộc.
2. **Kiểm tra trước nhập:** tổng mục, mục hợp lệ, độ dài không hỗ trợ, trùng cách viết/nghĩa, thiếu nghĩa, thiếu nguồn; xuất báo cáo lỗi. Không tự bỏ dấu, sửa từ hoặc tự gán quyền đã duyệt.
3. **Nhập theo lô:** một hành động bắt đầu, hàng đợi phần có tiến độ, retry phần lỗi, resume theo receipt/hash. Không yêu cầu chọn và bấm tải thủ công 50 lần. Nếu vượt 100 phần, chia phiên có manifest liên kết hoặc báo giới hạn rõ ràng.
4. **Duyệt nguồn một lần theo phiên bản:** hiển thị quyết định quyền hiện hành, bằng chứng và phạm vi áp dụng; thay đổi metadata/phiên bản cần kiểm tra lại. Không lặp quyết định nguồn cho mỗi mục.
5. **Phân nhóm biên tập:** nhóm có thể duyệt chung, nhóm thiếu nghĩa, trùng nghĩa cần chọn, từ hiếm/kỹ thuật, mục cần loại hoặc cần kiểm tra riêng. Máy chỉ gợi ý phân nhóm.
6. **Duyệt hàng loạt:** chọn hàng, chọn trang hoặc chọn tất cả kết quả lọc; ghi rõ số lượng và phạm vi, cho xem mẫu/phân bố và danh sách đầy đủ. Admin áp dụng quyết định có lý do cho nhóm đã kiểm tra. Phân biệt “Cho phép dùng để đoán” và “Cho phép làm đáp án”.
7. **Xử lý ngoại lệ:** các mục thiếu quyền, sai cấu trúc, thiếu nghĩa làm đáp án, mâu thuẫn/trùng nghĩa không tự được duyệt cùng nhóm. Có đường dẫn từ lỗi đến đúng mục.
8. **Xem trước xuất bản:** số mục thêm/loại so với release hiện hành, số guesses/answers từng cấp, dung lượng, nguồn, lỗi còn lại; cho thử một ván bằng bản dựng preview trong ngữ cảnh riêng, không thay player công khai.
9. **Xuất bản:** admin xác nhận bản dựng cụ thể; kiểm tra revision/hash rồi đổi con trỏ release nguyên tử. Thất bại giữ release cũ; ván đang chơi giữ snapshot cũ.

### 5.3. Quy tắc bulk an toàn và thuận tiện

- Không biến “upload thành công” thành “tự động duyệt/xuất bản”. Yêu cầu hiện tại cần explicit approval cho mỗi mục; cập nhật tài liệu để một quyết định nhóm có phạm vi rõ ràng tạo quyết định cho từng mục được chọn.
- Chọn tất cả kết quả lọc phải cố định tập ID/revision hoặc selection snapshot phía tin cậy; dữ liệu mới xuất hiện không tự lọt vào quyết định đang xác nhận.
- Edge Function xác thực admin, validate từng mục, kiểm tra revision, giới hạn lô/rate limit và idempotency. Không gửi 10.000 request review đơn cùng lúc hoặc tạo một request không giới hạn.
- Đề xuất ban đầu xử lý 100–200 mục/lô; đây là tham số cần benchmark, không phải bảo đảm năng lực đã đo. Ghi kết quả từng lô, checkpoint, số thành công/xung đột/lỗi; retry không nhân bản quyết định.
- Giữ lịch sử cho từng mục: revision trước/sau, config, inputs/outputs, timestamp, batch ID, actor role. Không gọi actor role admin là danh tính cá nhân nếu hệ thống vẫn dùng tài khoản chung.
- Các batch đã xong không bị mất khi batch sau lỗi. Resume bỏ qua receipt đã thành công; không tự đổi revision đầu vào để ghi đè thay đổi của admin khác.
- “Hoàn tác” là quyết định/phiên bản mới, không xóa audit. Nếu đã phát hành cần release sửa lỗi riêng; ván cũ không đổi âm thầm.
- Tập đáp án nhỏ được tuyển kỹ; tập guesses lớn được duyệt theo nguồn/nhóm. Không bắt toàn bộ 10.000 mục phải có chất lượng đáp án.
- UI dùng phân trang/lazy detail hoặc virtualize khi phù hợp; không render 10.000 form cùng lúc.

### 5.4. Nghiệm thu 10.000 mục

Trên môi trường staging được xác định, dùng dataset có nguồn và kích thước đại diện: tải toàn bộ bằng một lần chọn; ngắt giữa một phần rồi resume; retry không nhân bản; báo lỗi có dòng/phần; bulk qua nhiều trang; xung đột revision; hết phiên admin; phần đang chạy lỗi; preview vượt 2 MiB; thiếu cấp; thiếu nghĩa/quyền; chọn nghĩa trùng; xuất bản nguyên tử và ván cũ tiếp tục.

Đo thời gian nhập/duyệt/preview, số request, kích thước release/save và khả năng tương tác UI. Chưa có số đo hoặc cam kết thông lượng. Mục tiêu UX: không cần 10.000 lần mở và lưu form, chỉ review riêng các ngoại lệ và các nhóm cần kiểm tra nội dung.

## 6. Types và trình tự triển khai dự kiến

Các kiểu dưới đây là đề xuất, chưa phải API hiện có:

```ts
type GuessMode = "dictionary" | "free";
type WordLevel = 3 | 5 | 7 | 9;
type PlayerPreferences = { schemaVersion: 1; preferredLevel: WordLevel; guessMode: GuessMode };
type RoundRules = { guessMode: GuessMode; blockAbsentLetters: boolean };
type GuessEligibility =
  | { canSubmit: true; normalized: string }
  | { canSubmit: false; reason: "incomplete" | "composing" | "invalid" | "not-in-dictionary" | "absent-letter" | "unavailable" };
type BulkReviewTarget = { entryId: string; expectedEntryRevision: number };
type BulkItemResult = { entryId: string; status: "applied" | "unchanged" | "conflict" | "invalid"; message: string | null };
```

Pseudo-code player: normalize sau composition → xét trạng thái ván/độ dài/ký tự → xét luật chữ bị loại → chỉ ở dictionary mode kiểm membership → cập nhật canSubmit + thông báo → khi submit kiểm lại cùng luật → evaluate → lưu snapshot có rules → trả focus nếu còn chơi.

Pseudo-code bulk: tạo selection snapshot → preview nhóm và blocker → admin chọn quyết định → backend validate/auth/revision → xử lý từng lô idempotent → ghi audit/receipt → trả progress → resume lỗi có kiểm soát → build publication → admin publish.

Thứ tự khuyến nghị:

1. Sửa focus và link lộ đáp án; regression tests theo lỗi đã tái hiện.
2. Thêm cài đặt, mode, validator trước gửi, đổi số chữ; đồng thời migration/restore snapshot.
3. Rút hướng dẫn, bỏ icon, kiểm tra accessibility/mobile thật.
4. Import nhiều phần và bulk review qua trusted operations; không chỉ sửa UI rồi loop review đơn.
5. Mở rộng dictionary, rà chất lượng đáp án; staging benchmark 10.000 mục và xác nhận trước rollout.

Khi triển khai phải cập nhật gameplay/spec/dictionary requirements vì chế độ tự do và bỏ icon thay đổi yêu cầu cũ. Giữ RLS, private data, secrets, typed validation và feature boundaries theo AGENTS.md. Build/lint và các tests phù hợp là điều kiện khi có thay đổi code; lượt lập tài liệu này không chạy lại các suite đó.

## 7. Các phần chưa kiểm tra hoặc chưa kết luận

| Hạng mục | Giới hạn/bước cần làm tiếp |
| --- | --- |
| Thua sau 6 lượt | Chưa hoàn tất ván thua; dictionary nhỏ và khóa chữ đã loại hạn chế các lượt sai tiếp theo |
| Bộ gõ tiếng Việt thật | Unicode qua automation không chứng minh UniKey/Telex hoặc IME composition thực; cần Windows và thiết bị thật |
| Bàn phím mềm iOS/Android | Chưa thử focus/scroll/composition trên máy thật |
| Offline thực | Chỉ thấy thông báo sẵn sàng và reload online; công cụ hiện tại không cung cấp offline theo tab, không ngắt mạng toàn máy |
| Lỗi tải/retry player | Không cố tình làm hỏng backend, chưa tái hiện mạng lỗi hoặc mất release |
| Upload/finalize admin | Chỉ đọc giao diện/source; không gửi file hoặc finalize dữ liệu thật |
| Lưu review/quyền/chọn nghĩa | Chỉ xem form và lịch sử; không thử mutation, conflict hoặc retry trên dữ liệu thật |
| Publish thật | Chỉ tạo preview thành công; chưa kiểm chứng commit publication trên deployment này |
| 10.000 mục | Phân tích giới hạn source, chưa benchmark upload/DB/network/render hoặc chứng minh vừa payload |
| Bộ lọc admin | Quan sát điều khiển, chưa thử mọi tổ hợp và pagination trên tập dữ liệu lớn |
| Bộ nguồn/giấy phép | Không đánh giá tính đầy đủ của quyết định quyền hoặc pháp lý; trạng thái UI không tự chứng minh clearance |
| Accessibility toàn diện | Có Tab/Enter/Escape và nhãn AX; chưa kiểm screen reader thật, đo contrast, mọi nhóm dấu |
| Save hỏng/cross-tab | Chưa thử trên deployment trong lượt này; báo cáo cũ không thay thế kiểm chứng mới |
| Phiên bản deployment | Chưa ánh xạ commit local với Vercel và backend migrations/functions |
| Yêu cầu mới | Tất cả còn là đặc tả; chưa có mode tự do, bulk review hoặc icon-free UI được triển khai bởi lượt này |

## 8. Điểm tốt cần giữ và tài liệu đối chiếu

Giữ normalization có dấu, cơ chế chữ lặp, không mất lượt với input không được nhận, thông báo loading, snapshot phục hồi, xác nhận bỏ ván, board tồn tại sau kết thúc, phân biệt guesses/answers, import theo receipt/idempotency, revision guard và publication nguyên tử.

Source chính để triển khai tiếp (đường dẫn tương đối từ repository):

- `hooks/useWordInput.ts`: input, canSubmit và focus.
- `lib/vua-tieng-viet/player-engine.ts`: membership, chữ bị loại, đánh giá lượt.
- `lib/vua-tieng-viet/round-save.ts`: schema và replay khi phục hồi.
- `components/organisms/vua-tieng-viet/WordGame.tsx`: help/settings/result/attribution.
- `components/molecules/WordBoard.tsx`, `WordKeyboard.tsx`, `WordVariantKey.tsx`: feedback và bàn phím.
- `components/organisms/vua-tieng-viet/DictionaryPreviewPanel.tsx`, `CandidateEditorialPanel.tsx`, `DictionaryPublicationPanel.tsx`: ba bước admin.
- `hooks/useDictionaryPreview.ts`, `useDictionaryImport.ts`, `useCandidateEditorial.ts`, `useDictionaryPublication.ts`: điều phối dữ liệu.
- `lib/vua-tieng-viet/dictionary-contract.ts`, `import-contract.ts`, `editorial-contract.ts`, `public-release.ts`: giới hạn và validation hiện tại.
- `docs/features/vua-tieng-viet.md`, `vua-tieng-viet-spec.md`, `vua-tieng-viet-dictionary.md`: yêu cầu cần cập nhật khi triển khai.

Đã tham khảo [Supabase changelog](https://supabase.com/changelog.md) theo workflow của skill; không triển khai API Supabase mới hoặc dựa vào changelog để suy ra năng lực 10.000 mục. Các giới hạn số lượng trong tài liệu này lấy từ source repository, không phải giới hạn chung của Supabase.

</details>

