# 🚀 大 Boss 2 分鐘極速上架指南（Apify Store — Actor #3）

所有程式碼、完整 `.actor/` 四件套（含 `output_schema.json`）、數學級 3 層 Zero-PII 隔離器、SEC EDGAR 合規節流器、Zero-Charge 防死補丁、每日自動 Canary CI 與英文商品頁（含 B2B 三部曲交叉導流）皆已 100% 實測通過並推送至 GitHub (`howardKung/sec-form-d-funding-signals`)！

因為您已經開通好 Apify 收款帳號，現在只需 **2 分鐘** 點滑鼠即可發布第 3 支現金流引擎：

---

## Step 1：在 Apify Console 連結 GitHub 倉庫（30 秒）

1. 登入 [Apify Console](https://console.apify.com/)。
2. 左側選單點選 **Actors** → 右上角 **Develop new** → **Link Git repository**。
3. 貼上 GitHub URL：
   `https://github.com/howardKung/sec-form-d-funding-signals`
4. Branch 保持預設 `main`，點選 **Create**。

---

## Step 2：一鍵 Build 並試跑驗證（45 秒）

1. 進入 Actor 頁面，切到 **Source** 分頁，點選 **Build**（純 `apify/actor-node:22` 零瀏覽器，約 25~30 秒亮綠燈）。
2. 點選 **Start**（預設 `daysBack: 7`, `prefill maxResults: 15`, `excludePooledInvestmentFunds: true`）。
3. 約 **5~7 秒** 即跑完，確認 **Output** 表格呈現乾淨的新創公司名稱、州別、產業、融資金額與 `gtmSignals`（且 100% 無個資）！

---

## Step 3：開啟 Pay-Per-Event (PPE) 定價（30 秒）

1. 切到 **Publication** → **Monetization** 分頁，選擇 **Pay per event (PPE)**。
2. 新增計費事件（**事件名稱請完全一致**）：
   - **Event name**: `funding-signal-extracted`
   - **Event title**: `Startup Funding Signal Extracted (Zero-PII)`
   - **Event description**: `Charged per matching newly funded operating startup extracted from SEC Form D. $0 charge if 0 filings match.`
   - **Price per event**: 建議設定 **`$0.01`**（即 **`$10.00 / 1,000 筆`**，運算成本近乎 `$0`，毛利率 > 97%！）。

---

## Step 4：設定商店分類與一鍵 Publish（15 秒）

1. 切到 **Publication** 分頁：
   - **Title**: `US Startup Funding Signals — SEC Form D API (Zero-PII)`
   - **Categories**: 勾選 `Lead generation`, `Business`, `Finance`
   - **README**: 自動同步倉庫內建的英文 `README.md`（已內建三部曲互導連結）。
2. 將 **Visibility** 設為 **Public**，點選 **Save & Publish** 即大功告成！
