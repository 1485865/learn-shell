# PACK-FORMAT：題庫包格式（formatVersion 1）

這是 shell（空殼 app）與 pack（題庫包）之間唯一的契約。兩個 repo 各放一份，內容必須完全相同。
要修改本檔必須先經使用者同意，並同時更新兩個 repo。

## pack 的檔案

```
/pack.json
/items.json
/daily/index.json
/daily/YYYY-MM-DD.json
```

pack 是一組靜態檔案，shell 支援兩種來源，檔案的相對路徑相同：

- **網址**：一個公開的 base URL（例如 GitHub Pages）
- **GitHub repo**：`owner/repo` 與分支（預設 `main`），可以是 private；shell 以 GitHub Contents API 加上使用者的 PAT 讀取，請求時帶 `Accept: application/vnd.github.raw` 取得原始內容

## pack.json

```json
{
  "formatVersion": 1,
  "id": "english-gept-elementary",
  "name": "英檢初級",
  "version": "2026.10.03",
  "locale": "en-US",
  "timezone": "Asia/Taipei",
  "itemLabel": "單字",
  "questionTypes": ["choice", "audio-choice", "input", "cloze"],
  "capabilities": ["tts"],
  "daily": { "newItems": 10, "maxReviews": 40 }
}
```

- `id`：全域唯一，進度以它為 key，發佈後不可更改
- `locale`：發音與語音辨識使用的語言代碼
- `timezone`：決定「今天」是哪一天
- `capabilities`：可包含 `tts`、`stt`。shell 依此決定是否顯示發音與口說功能

## items.json

```json
[{ "id": "w0001", "front": "apple", "back": "蘋果", "fields": { "pos": "n." } }]
```

- `id` 發佈後不可更改或重複使用
- `fields` 為任意的字串鍵值，shell 以通用方式顯示

## daily/index.json

```json
{ "dates": ["2026-10-03", "2026-10-04"] }
```

靜態託管無法列目錄，shell 靠本檔得知有哪些日期可用。由出題腳本維護，日期遞增排序。

## daily/YYYY-MM-DD.json

```json
{
  "formatVersion": 1,
  "packId": "english-gept-elementary",
  "date": "2026-10-03",
  "items": [{
    "id": "w0001", "front": "apple", "back": "蘋果",
    "fields": { "pos": "n.", "ipa": "", "example": "", "example_translation": "" }
  }],
  "questions": [{
    "id": "2026-10-03-q01", "itemId": "w0001",
    "type": "choice",
    "prompt": "", "speak": "", "options": [], "answer": "", "explanation": ""
  }]
}
```

- `items`：當日的新項目（附當日生成的補充欄位）
- `questions`：可包含新項目與舊項目的題目
- `question.id` 全域唯一

## 題型

| type | 行為 | 必要欄位 |
|------|------|----------|
| choice | 顯示 prompt，從 options 選一個 | prompt, options, answer |
| audio-choice | 朗讀 speak（不顯示文字），從 options 選一個 | speak, options, answer |
| input | 顯示 prompt（有 speak 則可播放），輸入答案；比對時忽略大小寫與前後空白 | prompt, answer |
| cloze | prompt 中以 `___` 表示空格，從 options 選一個 | prompt, options, answer |

共同規則：

- 有 options 時 answer 必須是 options 之一，options 不可重複，數量 3 到 5 個
- `explanation` 必填，答錯時顯示
- `itemId` 必須存在於 items.json
- shell 遇到不認識的 type：跳過該題並顯示一次性提示，不可當掉
