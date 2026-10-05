# SPEC：learn-shell（通用學習空殼 app）

本檔是這個 repo 唯一的需求來源。題庫包格式以 `PACK-FORMAT.md` 為準。

## 背景

這是一個與科目無關的學習 app。內容全部來自外部的題庫包（pack），使用者可以安裝多個 pack 並切換。第一個 pack 是英檢初級，之後可能是日文或其他科目。介面語言為繁體中文。

核心原則：**shell 不知道自己在教什麼。** 原始碼中不可出現任何特定科目的假設（寫死的語言代碼、「單字」之類的用語、英文專屬邏輯）。這些一律來自 pack.json。

## 硬性限制

- vanilla JS，零外部依賴，不用框架、不用 CDN、不用建置工具
- 部署：GitHub Pages（純靜態）
- 測試：Node 20 內建的 `node --test`，不裝 npm 套件
- 任何 token 都不得出現在 repo 中
- 排程、進度合併、日期計算必須是不碰 DOM 的純函式模組，才能被測試
- 不可修改 `PACK-FORMAT.md`

## Repo 結構

```
/index.html /style.css /sw.js /manifest.json
/src/            應用程式模組（ES modules）
/src/core/       純函式：fsrs、merge、dates、session、validate-pack
/fixtures/sample-pack/   符合 PACK-FORMAT 的測試用 pack（非英文專屬也可）
/tests/
/SPEC.md /PACK-FORMAT.md /AGENTS.md /CLAUDE.md /PLAN.md /README.md
/.review/        （在 .gitignore 內）
```

## 功能

### 1. Pack 管理

- 設定頁以 base URL 新增 pack；讀取 pack.json 並驗證 formatVersion 與必要欄位，不符則拒絕並說明原因
- 可安裝多個 pack、切換目前使用的 pack、移除 pack（移除前確認，進度保留）
- 開發與測試使用 `/fixtures/sample-pack/`

### 2. 每日學習流程

- 「今天」依 pack.json 的 timezone 判定
- 一次學習 = 今日的新項目 + 到期的複習
- 流程：先看新項目卡片（front、back、fields、發音鈕）→ 作答 → 答錯立即顯示 explanation
- 沒有今日題庫時，使用 index.json 中最近一份尚未學過的，並提示
- 複習題來源：該項目在已快取的歷史 daily 檔中的題目，隨機抽一題；沒有題目時退回「看 front 回想 back，自行評分」的卡片
- 每日複習上限為 pack.json 的 `daily.maxReviews`，超過的順延
- **做完就鎖住**：當日完成後顯示完成畫面，不提供加練。可以瀏覽已學項目，但不計入任何紀錄

### 3. 排程：FSRS-6

- 依 open-spaced-repetition 公開的 FSRS-6 規格移植為純函式，使用官方預設參數，不實作最佳化器
- 每個項目儲存 difficulty、stability、lastReview、due、reps、lapses
- 目標記憶率預設 0.90，設定頁可調（0.80 到 0.95）
- 評分：答錯 = Again；答對 = Good，並在答對後提供「勉強想起」（Hard）與「太簡單」（Easy）可改選
- 每次複習寫入 review log：`{ id, packId, itemId, time, rating, elapsedDays, scheduledDays }`
- 測試向量必須來自官方實作：允許在 repo 之外的暫存目錄安裝官方實作來產生向量，把向量與產生方式（版本、指令）記錄在 `/tests/fsrs-vectors/`。不可用自己的實作產生期望值

### 4. 發音

- pack 的 capabilities 含 `tts` 時啟用
- Web Speech API（speechSynthesis），語言用 pack.json 的 locale；可調語速，提供慢速播放
- 裝置沒有該語言的語音時，明確提示而不是靜默失敗

### 5. 統計與動機設計

- **不做** XP、積分、排行榜、徽章
- 統計頁：已學項目數、依穩定度分組的分佈、實際記憶率（複習時答對的比例）、近 30 天每日完成情況、失誤最多的 20 個項目
- 連續天數：每 7 天允許 1 天缺席而不中斷
- 週測驗：每 7 天提供一次，從過去 7 天學過的項目抽最多 30 題；作答中不顯示對錯，結束後給分數；分數記入統計並顯示歷次趨勢；週測驗不影響排程

### 6. 進度儲存與同步

- 本機：IndexedDB，以 packId 分開
- 同步目標：使用者自己的 **private** repo。設定頁輸入 owner/repo 與 fine-grained PAT（PAT 只存在本機 IndexedDB）
- 用 GitHub Contents API 讀寫：
  - `progress/<packId>.json`：`{ "schemaVersion": 1, "items": { "<itemId>": { ...排程狀態, "speakMiss": 0 } } }`
  - `logs/<packId>/<YYYY-MM>.json`：review log 陣列
- 合併規則：progress 以每個項目較新的 lastReview 為準；log 以 id 做聯集。寫入時帶 sha，sha 過期則重新讀取、合併、再寫
- 離線時照常使用，上線後自動同步
- 未設定同步也必須能完整使用

### 7. 可靠性

- 錯誤紀錄：攔截未處理的錯誤與 promise rejection，存入 IndexedDB（最多 200 筆），設定頁可檢視、一鍵複製、清除
- 備份：設定頁可匯出與匯入全部本機資料（JSON）
- 所有儲存的資料都有 schemaVersion；讀到較舊版本時要遷移，讀到較新版本時拒絕並提示更新 app

### 8. PWA

- 可安裝、離線可用（app 本體與已載入的 pack 資料）
- service worker 更新策略必須避免使用者卡在舊版：有新版時提示重新載入

### 9. 介面原則

- 手機優先，單手可操作，主要按鈕在畫面下半部
- 一個畫面只做一件事
- 支援深色模式（跟隨系統），字體大小可調
- 四個主要畫面：今日、作答、統計、設定
- 外觀簡潔即可，不做動畫與裝飾

## Milestones

| # | 內容 |
|---|------|
| S0 | PLAN.md |
| S1 | pack 載入與驗證、fixtures、每日學習流程（無排程）、發音 |
| S2 | FSRS-6 + 測試向量、IndexedDB、複習、每日鎖定 |
| S3 | 統計、連續天數、週測驗 |
| S4 | 同步到 private repo |
| S5 | PWA、錯誤紀錄、備份、schemaVersion 遷移、README |
| S6 | Android APK（TWA） |
| S7 | 口說練習 |

S5 通過後停下來等使用者實測，使用者確認後才做 S6、S7。

### S6：Android APK（TWA）

- 用 Bubblewrap 把已部署的 PWA 打包成 TWA（不可用 WebView 包裝：WebView 通常不支援 speechSynthesis）
- `apk.yml`：workflow_dispatch 觸發，build 後把已簽章的 APK 上傳到 GitHub Releases
- keystore 以 base64 存在 Secrets，不得 commit
- 產生 assetlinks.json，README 說明它必須放在 `<帳號>.github.io` repo 的 `/.well-known/`
- manifest 符合 TWA 要求（192 與 512 icon、maskable icon、start_url、scope、standalone）

### S7：口說練習

- pack 的 capabilities 含 `stt` 時才顯示「口說」分頁
- 素材：當日 items 中 pack 指定的例句欄位（由 pack.json 新增的選用欄位 `speakingField` 指定；此項需先經使用者同意修改 PACK-FORMAT）
- 跟讀：播放 TTS → 錄音（MediaRecorder）→ 重播原音與錄音；錄音只存在記憶體
- 朗讀：SpeechRecognition 以 pack 的 locale 辨識，逐字比對，未辨識出的字標示並可單獨聽
- 不支援或權限被拒時有明確提示；結果寫入 progress 的 speakMiss

## 驗收

- `node --test` 全數通過，包含 FSRS 官方測試向量
- 用 fixtures 可完整跑完一天的學習流程
- 原始碼中搜尋不到寫死的語言代碼或科目用語
- repo 內搜尋不到任何 token
- 斷網後仍可完成當日學習

## 審查重點（給審查者）

- FSRS：測試向量是否真的來自官方實作（檢查產生紀錄），而不是實作者自己算的
- 科目中立：搜尋 `en-US`、`en_`、「單字」、`word`、`vocab` 等字樣，出現在 `/fixtures/` 以外即為 Major
- 合併邏輯：兩台裝置離線各自複習後同步、sha 過期、log 重複，是否都有測試
- 每日鎖定與日期：跨午夜、裝置時區與 pack 時區不同時是否正確
- pack 資料是否被當成不可信輸入（壞的 pack 不可讓 app 當掉或執行其中的 HTML）
- service worker 是否會讓使用者卡在舊版
- PAT 是否只存在 IndexedDB，沒有出現在網址、log、錯誤紀錄、備份匯出檔中
