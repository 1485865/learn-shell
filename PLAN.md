# learn-shell 實作計畫

需求只依本 repo 的 SPEC.md，題庫契約只依 PACK-FORMAT.md。先完成 S0，之後逐階段實作、驗收、commit、建立 request 並停下；通過審查才進下一階段。只在 work 工作，不重新初始化 Git，不 push、不切換或修改 main，不修改規格、規則或 feedback。

## 技術與資料原則

- 使用 vanilla JS、ES modules、原生 CSS 與瀏覽器 API。零外部依賴，不使用框架、CDN、建置工具或 npm 套件；app 以純靜態 GitHub Pages 部署。
- 排程、日期、進度合併、學習場次與資料驗證放在 src/core/，不碰 DOM、網路或儲存；時間、輸入資料與亂數由呼叫端提供，使測試可重現。介面、題庫讀取、IndexedDB、同步與瀏覽器能力由外層模組負責。
- shell 不含科目假設。名稱、項目稱呼、locale、timezone、題型、capabilities 與每日數量來自 pack；補充 fields 以通用方式顯示，不指定某種語言或固定補充欄位。
- 外部 pack、同步資料及匯入備份均視為不可信輸入。驗證後才使用，內容以文字呈現，不執行其中的 HTML；錯誤提供可理解的繁體中文提示。
- 每個 pack 的快取、進度與紀錄分開管理，以 packId 與 itemId 辨識，不以題庫名稱或顯示文字作為身分。
- 所有持久資料標示 schemaVersion。PAT 僅存本機 IndexedDB，不放在網址、log、錯誤紀錄、備份或 repo；同步請求透過必要的授權標頭使用，不輸出原始敏感例外。
- 測試用 Node 20 內建 node --test；核心測試不依賴 DOM。瀏覽器、手機及部署項目另列人工驗收，未實測不宣稱通過。

## S0：計畫與審查交接

本輪只新增 PLAN.md，檢查範圍、規格對照、文件與 Git 狀態，commit 後建立 .review/S0-r1-request.md。沒有應用程式、測試或部署產物，不開始 S1。

兩個 repo 的 PACK-FORMAT 目前不一致：本 repo 規定只以 base URL 讀公開靜態題庫，現有題庫 repo 的契約另支援 private GitHub repo。S0 不擅自改契約或增加來源功能；在 request 提出差異。S1 依本 repo 屆時經使用者確認的規格實作。

## S1：題庫、每日流程與發音

- 建立 index.html、style.css 與 src/ 模組，提供今日、作答、統計、設定的基本導覽；後續階段的畫面逐步接入功能，不預先加入未實作的操作。
- 設定頁依目前契約用 base URL 安裝 pack。驗證 pack 的 formatVersion、必要欄位、capabilities、日期、項目參照與題型資料；拒絕無效包並說明原因。支援多包切換與移除前確認，資料保留的持久化在 S2 接上。
- 建立 fixtures/sample-pack，涵蓋四種題型、通用補充欄位及所需日期；特定內容只放 fixtures，不放進應用程式邏輯。
- 以 pack.timezone 計算今天。今日題庫缺少時，選 index 中最近且尚未學過的題庫並提示；沒有可學資料時提供明確狀態。
- 完成無排程的新項目流程：先看卡片，再作答，答錯立即顯示 explanation。選擇與填空依契約判斷；輸入比對忽略大小寫與前後空白；未知題型跳過並只提示一次。
- capabilities 有 tts 才提供發音，語言使用 pack.locale，支援語速及慢速播放；等待可用語音，缺少支援時明確提示。
- 此階段先完成流程及必要場次狀態；FSRS、IndexedDB、到期複習與跨重啟每日鎖定在 S2 實作。
- 驗收：核心資料驗證及日期的正反例；fixtures 四題型完整跑完；不可信內容不執行；手機導覽、TTS 支援／缺少語音人工實測；掃描科目假設及憑證。

## S2：FSRS-6、儲存、複習與每日鎖定

- 將公開的 FSRS-6 官方規格移植為純函式，使用官方預設參數，不加入最佳化器。保存 difficulty、stability、lastReview、due、reps、lapses；目標記憶率預設 0.90，設定限 0.80–0.95。
- 在 repo 外暫存目錄使用官方實作產生測試向量。將固定版本、預設參數、產生指令、輸入／輸出及來源記錄於 tests/fsrs-vectors/；期望值不得由本專案實作產生。官方工具與依賴不進 repo。
- 覆蓋初次與重複複習、Again／Hard／Good／Easy、遺忘與不同間隔。答錯為 Again，答對預設 Good，可改選 Hard 或 Easy；只提交最終評分，避免改選造成重複紀錄。
- 使用 IndexedDB 保存已安裝 pack、選取狀態、快取、逐包進度、場次及 review log。每次複習記錄 id、packId、itemId、time、rating、elapsedDays、scheduledDays；移除 pack 保留進度，重新加入同 ID 可沿用。
- 一次學習包含當日新項目及到期複習，複習數不超過 daily.maxReviews，超額順延。從已快取歷史題目抽取該項目的題目；沒有題目時退回自行評分的回想卡片。
- 完成後按 pack 的當日日期持久鎖定，重載也不提供加練；瀏覽已學項目不修改任何進度或紀錄。日期切換重新計算，不能依裝置時區推定 pack 的今天。
- 驗收：官方向量逐項比對、評分改選、複習上限、題目與回想備援、不同 pack 隔離、重新加入進度、跨午夜與不同裝置時區、重載鎖定及只瀏覽不寫紀錄。IndexedDB 行為另用瀏覽器驗收。

## S3：統計、連續天數與週測驗

- 統計已學項目、穩定度分佈、複習實際答對比例、近 30 天完成情況及失誤最多的 20 項；資料計算為純函式。分組界線與空資料結果在實作 request 記錄供審查。
- 依 pack 日期計算連續天數，每 7 天可缺席 1 天不中斷；測試允許缺席、再次缺席、跨月／跨年與未來日期，不以裝置時區計算。
- 每 7 天提供一次週測驗，從過去 7 天學過的項目抽最多 30 題。作答中不顯示對錯，完成後給分數及歷次趨勢；測驗結果保存為統計，不改 FSRS 或一般複習紀錄。
- 不加入 XP、積分、排行榜或徽章。
- 驗收：計算正反例、資料不足與零筆結果、抽題範圍與數量、過程不揭示答案、重載及測驗不影響排程；手機統計及趨勢人工實測。

## S4：private 進度同步

- 設定 owner/repo 與 fine-grained PAT，PAT 只保存 IndexedDB；未設定同步時全部本機學習功能仍可使用。
- 以 GitHub Contents API 讀寫 progress/<packId>.json 及 logs/<packId>/<YYYY-MM>.json，維持指定的 schemaVersion 1 與 speakMiss 欄位。
- 進度以逐項較新 lastReview 合併，log 以 id 聯集去重；兩者皆為純函式。帶 sha 寫入，過期時重新讀取、合併及寫入，不覆蓋另一台裝置的新增紀錄。
- 離線照常寫本機，上線後自動同步；失敗保留尚未同步資料並提示，不將 HTTP 內容、PAT 或授權網址寫入 log。
- 驗收：兩台裝置離線新增後合併、sha 過期、重複 log、跨月與跨 pack、網路失敗及重連。測試用替代傳輸，真實 private repo／PAT 另由使用者人工驗收。

## S5：PWA、可靠性、備份與 README

- 加入 manifest 及 service worker，支援安裝，離線保存 app 本體與已載入的 pack。快取必須按部署路徑及版本管理；新版可提示重新載入，不讓使用者永久停在舊版本。
- 攔截未處理錯誤與 promise rejection，清除敏感資訊後保存 IndexedDB，最多 200 筆；設定頁提供檢視、複製與清除。
- 匯出／匯入全部可備份本機功能資料，先驗證版本與結構，PAT 不匯出；恢復後另行設定憑證。較舊版本遷移，較新版本拒絕並提示更新；失敗不得破壞既有資料。
- 完成手機優先、主要操作在下半部、單畫面單一任務、跟隨系統深色模式與字體大小設定。不加入動畫或裝飾。
- README 說明靜態部署、題庫設定、本機／同步使用、離線、更新、備份及人工測試步驟；不包含實際憑證。
- 驗收：斷網完整完成當日流程、PWA 安裝、新舊 service worker 切換、錯誤上限及敏感資訊清除、備份往返、壞備份、舊版遷移及新版拒絕。桌面與手機瀏覽器另列測試結果。
- S5 通過後停下等待使用者實測；使用者確認前不開始 S6 或 S7。

## S6 與 S7：需使用者確認後才開始

- S6 使用 Bubblewrap 將已部署 PWA 包為 TWA，提供手動 apk.yml、簽章 APK Releases、Secrets 中的 keystore 與 assetlinks.json 放置說明；不使用 WebView。此階段工具不改變靜態 app 零依賴原則，簽章檔不得進 repo。Android 安裝、TTS 與連結驗證需真機實測。
- S7 僅在 capabilities 含 stt 時提供口說。speakingField 的契約修改必須先取得使用者同意並同步兩 repo；未核准前不預先實作。素材欄位、TTS 與辨識語言均來自 pack；錄音只在記憶體，辨識失誤更新 speakMiss，缺支援或權限被拒時提示。錄音、麥克風及辨識需真機實測。

## 每輪交付與檢查

每輪執行適用的 Node 20 測試、語法檢查、fixtures 流程、科目中立與洩密掃描，檢查 git diff 範圍，只提交該 milestone 的檔案。文件階段不以沒有應用程式的測試冒充驗收。request 列出 commit、檔案、可重跑指令、實際結果、已知限制及未執行的瀏覽器／手機項目，然後停下等審查。
