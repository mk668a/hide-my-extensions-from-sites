# hide-my-extensions-from-sites 🛡

**[English](README.md) ・ 日本語**

<p align="center">
  <img src="store/assets/promo-marquee-1400x560.png" alt="サイトはあなたの拡張一覧で指紋を取る。一覧ごと隠す。汎用・ローカル・無料 — 拡張列挙に対するプライバシー版 uBlock。" width="820">
</p>

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

| 受動防御 — 一覧を隠す | 欺瞞モード — 列挙を汚す |
|:---:|:---:|
| ![現在のタブで拡張 probe をブロックしているポップアップ](store/assets/screenshot-1-hero.png) | ![スキャナに偽の「インストール済み」結果を返すポップアップ](store/assets/screenshot-2-deception.png) |

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
- 対象: **Chrome / Chromium**（111+）と **Firefox**（140+）、Manifest V3。

---

## 🎯 脅威モデルとカバレッジ

攻撃者は **Web ページ**で、`chrome-extension://{id}/{resource}`（や `moz-extension://…`）
を要求して応答の有無からインストール済み拡張を列挙しようとします。本拡張はページの
MAIN world・`document_start`（ページスクリプトより前）で動き、probe を発行・観測しうる
あらゆるリクエスト経路を無力化します。

**ブロックする probe 経路**（各々に回帰テストあり）:

| 経路 | 無力化の方法 |
|---|---|
| `fetch()` | 拡張 URL の probe を reject（deception モードでは fake） |
| `XMLHttpRequest` | 拡張 URL への `open()` を dead URL に差し替え |
| `<img>` / `<script>` / `<link>` の `src`/`href` | setter + `setAttribute` を書き換え |
| `<iframe>` / `<object>` / `<embed>` | `src` / `data` setter + `setAttribute` を書き換え |
| `srcset`（`<img>` / `<source>`） | setter + `setAttribute` を書き換え |
| SVG `<use>` の `xlink:href` | `setAttributeNS`（名前空間付き）を書き換え |
| CSS `url(extension://…)` | `setProperty` / `cssText` / `setAttribute("style")` を除去 |
| `navigator.sendBeacon` | 拡張 URL の beacon を破棄 |
| `EventSource` | 拡張 URL のストリームを dead URL に差し替え |

**信頼境界。** ISOLATED world のブリッジは、ページスクリプトが走る前に MAIN world へ
ロード毎の nonce を渡します。以降の config 更新はすべてこの nonce を要求し、same-origin
(`'/'`) で通信します。よって悪意あるページは**メッセージを偽装して保護を OFF にできず**、
nonce を盗み見ることもできません。

**既知の gap（設計上の明示）:**

- **`el.style.backgroundImage = …`**（camelCase プロパティ直接代入）は Chrome では
  *native named setter* で `CSSStyleDeclaration.prototype` 上に無く、patch 不能。CSS は
  load/error シグナルも出さず列挙 oracle として弱い。上記の文字列ベース CSS 経路は対応済み。
- **タイミング oracle**（`onload`/`onerror` の遅延差）は未正規化 — 単純な patch では
  なく設計が要るため 1.0 では対象外。
- Firefox for **Android** の `web-ext` lint 警告が 1 件（data-collection キーの下限）。
  本ビルドはデスクトップ対象。

**config スキーマ（v1 で凍結）。** 保存される config は
`{ schemaVersion, enabled, deception, allowlist }` のみ。読み込み時にこの形へ migration:
`enabled` は fail-safe（boolean 以外は**保護 ON**）、`deception` は厳格な opt-in、
`allowlist` は小文字 32 文字 ID に検証。旧式・破損 config は冪等に in-place 更新。

---

## 📦 インストール（ローカルで読み込む）

ストア未掲載。unpacked で動かします。`npm run build` は `dist/` に 2 つの zip を生成します:
`…-chrome-<version>.zip` と `…-firefox-<version>.zip`。コードは同一で、manifest だけが
異なります（Firefox は event-page background を使い、データ収集なしを宣言）。

**Chrome / Chromium（111+）:**

1. Chrome 用フォルダを用意（repo を clone、または `…-chrome-<version>.zip` を解凍）。
2. `chrome://extensions` を開く → 右上の **デベロッパーモード** を ON。
3. **パッケージ化されていない拡張機能を読み込む** で `manifest.json` のあるフォルダを選択。

**Firefox（140+）:**

1. `…-firefox-<version>.zip` を解凍。
2. `about:debugging#/runtime/this-firefox` を開く。
3. **一時的な拡張機能を読み込む** で中の `manifest.json` を選択。

どちらもツールバーに 🛡 アイコンが出ます。クリックで保護の ON/OFF とタブ別スキャン数を確認。

> `.zip` は直接インストールできません。先に解凍してください。Firefox は 140+、
> Chrome / Chromium は 111+ が必要（どちらも MAIN-world content script のため）。

## 🧪 開発・テスト

```sh
npm install
npm test            # ユニット + 統合（vitest + jsdom）
npm run test:e2e    # システムテスト（Playwright。初回のみ npx playwright install chromium）
npm run build       # dist/ に読み込み用 zip を生成
```

テストは多層: ユニット + 統合（`tests/`）は vitest で実行、E2E は実物の unpacked 拡張を Chromium にロードして検証。Firefox 版の manifest は `tools/firefox-manifest.js` が Chrome 版から生成し（単一の真実）、`web-ext lint` で検証します。

## 🚧 ステータス

**v1.0 — 安定版。** config スキーマを凍結（in-place migration 付き）、ブロックする
ベクタは上記に明文化し各々に回帰テスト（ユニット + 統合 + Chromium E2E）。配布は
ローカルの「Load unpacked / 一時的な拡張機能を読み込む」zip。Chrome Web Store /
Firefox Add-ons へは未掲載。

## 📄 ライセンス

MIT
