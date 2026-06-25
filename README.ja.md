# hide-my-extensions-from-sites 🛡

**[English](README.md) ・ 日本語**

**Hide my extensions from every site that scans.**

サイトはあなたに黙って「どのブラウザ拡張を入れているか」を読み取れます。`chrome-extension://{id}/{resource}` を端から fetch して、応答の有無でインストール済み拡張を**列挙**する手口です（LinkedIn の "BrowserGate" で表面化）。これは強力な fingerprint シグナルになり、トラッキング・標的化・検閲に使われます。

`hide-my-extensions-from-sites` は、この列挙を**全サイトに対して**潰すブラウザ拡張です。特定サイト専用の対症療法ではなく、手口そのものをブロックする「プライバシー版 uBlock」。

> 一言でいうと: **あなたの拡張一覧を、どのサイトからも見えなくする。**

---

## 😩 なぜ作るのか

- **拡張は指紋になる。** インストール済み拡張の組み合わせは、Cookie を消しても残る安定した識別子になり得ます。
- **既存の防御が局所的すぎる。** browsergate-shield 系は LinkedIn 固有 ID の照合のみ。同じ手口を使う他サイトへの**汎用**防御が Chrome に存在しません。

---

## 🧱 しくみ

1. **MAIN-world で `chrome-extension://` probe を interpose** — content_script から `fetch` / `XHR` / DOM(`img`/`link` タグ) / Worker / cache 経由の拡張 ID 探索を横取りします。
2. **存在を隠す（受動防御）** — probe には一律で「無い」応答を返し、インストール済み拡張を読み取れなくします。
3. **列挙を汚す（能動欺瞞、任意モード）** — 「無い」を返すだけでなく、**偽の拡張リスト**を返してスキャナの結果を汚染します。受動防御が「漏らさない」なら、こちらは「嘘を掴ませる」。
4. **動きが見える** — スキャンを検知したサイトでアイコンにバッジ（例: `🛡 12 scans blocked`）+ リアルタイムログ。

---

## 🥊 比較

| | 範囲 | 能動欺瞞 |
|---|---|---|
| browsergate-shield | LinkedIn 専用 | なし |
| TrackPrivacy | 汎用 | なし |
| **hide-my-extensions-from-sites** | **汎用（全サイト）** | **あり（任意モード）** |

---

## 🔒 スコープ

- **アカウント不要・サーバー不要・クラウド不要。** すべてブラウザ内でローカルに動く決定的処理。オフラインで完結し、無料。
- **信頼する拡張の allow-list。** ページに正規にリソースを供給する拡張は、popup で ID を登録すればそのまま通します（誤爆回避）。
- 対象: **Chrome / Chromium**、Manifest V3。

---

## 📦 インストール（ローカルで読み込む）

Chrome Web Store 未掲載。unpacked で動かします:

1. このフォルダを用意（clone する、または `npm run build` で `dist/hide-my-extensions-from-sites-<version>.zip` を作って解凍）。
2. `chrome://extensions` を開く。
3. 右上の **デベロッパーモード** を ON。
4. **パッケージ化されていない拡張機能を読み込む** で `manifest.json` のあるフォルダを選択。
5. ツールバーに 🛡 アイコンが出ます。クリックで保護の ON/OFF とタブ別スキャン数を確認。

> `.zip` は Chrome に直接インストールできません。先に解凍して、フォルダを「読み込む」。Chrome / Chromium 111+ が必要（MAIN-world content script のため）。

## 🧪 開発・テスト

```sh
npm install
npm test            # ユニット + 統合（vitest + jsdom）
npm run test:e2e    # システムテスト（Playwright。初回のみ npx playwright install chromium）
npm run build       # dist/ に読み込み用 zip を生成
```

テストは多層: ユニット + 統合（`tests/`）は vitest で実行、E2E は実物の unpacked 拡張を Chromium にロードして検証。

## 🚧 ステータス

**初期ビルド** — 拡張は end-to-end で動作（unpacked で読み込み可能）、ユニット・統合・E2E
テストでカバー済み。Chrome Web Store へは未公開。

## 📄 ライセンス

MIT
