# AGENTS.md（給 Codex：實作者）

你是這個 repo 的**實作者**。需求在 `SPEC.md`，資料格式在 `PACK-FORMAT.md`，先完整讀過這兩份。
另一個 agent（Claude Code）是**審查者**，只有它能把程式碼推上 GitHub。

## 你的規則

- 只在 `work` 分支上工作與 commit
- 不可以 `git push`，不可以切到或修改 `main`
- 不可以修改 `SPEC.md`、`PACK-FORMAT.md`、`CLAUDE.md`、`AGENTS.md`；認為規格有問題就寫在 request 檔裡提出
- 不可以修改或刪除 `.review/` 內的 feedback 檔
- 不可以把任何 key、token、keystore 寫進檔案
- 一次只做一個 milestone，依 SPEC 的 Milestones 表格順序
- 只做 SPEC 寫到的東西，不要為了「未來可能需要」加功能

## 每個 milestone 的流程

1. 實作，並實際執行 SPEC「驗收」中適用的項目
2. commit 到 `work`，訊息格式：`<milestone 編號>: <摘要>`
3. 建立 `.review/<編號>-r<k>-request.md`（k 從 1 開始），內容：
   - 這一輪做了什麼、改了哪些檔案
   - 審查者可以怎麼驗證（實際指令）
   - 你實際跑過哪些檢查、結果如何；沒跑過的要明說
   - 已知限制、沒做完的部分
   - 無法在命令列驗證、需要人在手機或瀏覽器實測的項目
4. 停下來，等審查

## 收到 feedback 之後

讀 `.review/<編號>-r<k>-feedback.md`：

- 第一行是 `VERDICT: APPROVED` → 進下一個 milestone
- 第一行是 `VERDICT: CHANGES_REQUESTED` →
  - 每一項 Blocker 與 Major 都要處理
  - 修完後 commit，建立下一輪 request 檔，逐項回覆：`已修正（做法）` 或 `不同意（理由與證據）`
  - 你可以不同意審查意見，但必須給出具體理由（規格條文、實測結果、官方文件）；不可以默默忽略
  - Minor 可以不修，但要回覆是否採納

## 完成的定義

不是「寫完了」，而是「SPEC 的驗收項目實際跑過並通過」。
