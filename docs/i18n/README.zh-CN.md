# hide-my-extensions-from-sites 🛡

**[English](../../README.md) ・ [日本語](README.ja.md) ・ 简体中文 ・ [한국어](README.ko.md) ・ [Español](README.es.md) ・ [Français](README.fr.md)**

<p align="center">
  <img src="../../store/assets/promo-marquee-1400x560.png" alt="网站通过你的扩展给你打指纹。把整份清单藏起来。通用、本地、免费 —— 扩展枚举界的隐私版 uBlock。" width="820">
</p>

**Hide my extensions from every site that scans.**

网站可以悄悄读取*你安装了哪些浏览器扩展*。它们逐个请求 `chrome-extension://{id}/{resource}` 这样的 URL，再根据哪些有响应来**枚举**你已安装的扩展 —— 这正是 LinkedIn "BrowserGate" 暴露出来的手法。这是一个很强的指纹信号，可被用于追踪、定向乃至审查。

`hide-my-extensions-from-sites` 会在**所有网站上**封杀这种枚举：不是针对单个站点打补丁，而是直接封死这套手法本身 —— 一个「隐私版 uBlock」。

> 一句话：**让你的扩展清单对任何网站都不可见。**

---

## 😩 为什么做它

- **扩展就是指纹。** 已安装扩展的组合是一个稳定的标识符，清除 Cookie 也无法将其抹去。
- **现有防御太局部。** 像 browsergate-shield 这类工具只匹配 LinkedIn 特定的扩展 ID。在 Chrome 上，针对其他站点使用同一手法，并没有**通用**的防御。

---

## 🧱 工作原理

1. **在 MAIN world 中拦截 `chrome-extension://` 探测** —— 在 content_script 中拦截通过 `fetch` / `XHR` / DOM（`img`/`link` 标签）/ Worker / 缓存发起的扩展 ID 探测。
2. **隐藏存在（被动防御）** —— 对探测一律返回「不存在」的统一响应，使已安装扩展无法被读取。
3. **污染枚举（主动欺骗，可选模式）** —— 不只是返回「不存在」，而是返回一份**伪造的扩展清单**来污染扫描器的结果。如果说被动防御是「不泄露」，那么这就是「让它吞下谎言」。
4. **看得见效果** —— 当某个站点被抓到扫描时，图标会显示徽标（例如 `🛡 12 scans blocked`）并附带实时日志。

| 被动防御 —— 隐藏清单 | 欺骗模式 —— 污染扫描 |
|:---:|:---:|
| ![弹窗显示当前标签页上被拦截的扩展探测](../../store/assets/screenshot-1-hero.png) | ![弹窗向扫描器返回伪造的「已安装」结果](../../store/assets/screenshot-2-deception.png) |

---

## 🥊 对比

| | 范围 | 主动欺骗 |
|---|---|---|
| browsergate-shield | 仅 LinkedIn | 否 |
| TrackPrivacy | 通用 | 否 |
| **hide-my-extensions-from-sites** | **通用（所有站点）** | **有（可选模式）** |

---

## 🔒 范围

- **无账号、无服务器、无云端。** 一切都在你的浏览器本地运行 —— 确定性、离线、免费。
- **可信扩展白名单。** 有些扩展确实会合法地向页面提供资源；在弹窗里加入它们的 ID，其请求即可原样放行。
- 目标平台：**Chrome / Chromium**（111+）与 **Firefox**（140+），Manifest V3。

---

## 🎯 威胁模型与覆盖范围

攻击者是一个**网页**，它通过请求 `chrome-extension://{id}/{resource}`（或 `moz-extension://…`）这样的 URL 并观察哪些能够解析，来试图得知你安装了哪些扩展。我们在页面的 MAIN world 中、于 `document_start` 时机、先于任何页面脚本运行，并中和页面可用来发起或观测此类探测的每一个请求通道。

**已封堵的探测向量**（每一项都有回归测试）：

| 通道 | 如何中和 |
|---|---|
| `fetch()` | 拒绝扩展 URL 探测（欺骗模式下则返回伪造结果） |
| `XMLHttpRequest` | 对扩展 URL 的 `open()` 被重定向到一个死 URL |
| `<img>` / `<script>` / `<link>` 的 `src`/`href` | 重写属性 setter 与 `setAttribute` |
| `<iframe>` / `<object>` / `<embed>` | 重写 `src` / `data` 的 setter 与 `setAttribute` |
| `srcset`（`<img>` / `<source>`） | 重写 setter 与 `setAttribute` |
| SVG `<use>` 的 `xlink:href` | 重写 `setAttributeNS`（带命名空间） |
| CSS `url(extension://…)` | 清洗 `setProperty` / `cssText` / `setAttribute("style")` |
| `navigator.sendBeacon` | 丢弃指向扩展 URL 的 beacon |
| `EventSource` | 将指向扩展 URL 的流重定向到一个死 URL |

**信任边界。** ISOLATED world 的桥接会在任何页面脚本运行之前，向 MAIN world 交付一个每次加载唯一的 nonce；每一次配置更新都必须带上它，并通过同源（`'/'`）通道传递。因此，恶意页面**无法伪造一条消息来关闭防护**，也无法嗅探到该 nonce。

**已知缺口（有意为之，并已记录）：**

- **`el.style.backgroundImage = …`**（直接的 camelCase 属性）在 Chrome 中是一个*原生具名 setter* —— 它不在 `CSSStyleDeclaration.prototype` 上，因此无法被打补丁。CSS 也不提供 load/error 信号，作为枚举预言机很弱；上面那些基于字符串的 CSS 路径*已被覆盖*。
- **时序预言机**（`onload`/`onerror` 的延迟差异）尚未被归一化 —— 这需要一套设计，而非单个补丁，已排除在 1.0 之外。
- 一条针对 **Firefox-for-Android** 的 `web-ext` lint 警告（数据收集键下限）；本构建面向桌面端。

**配置 schema（已在 v1 冻结）。** 存储的配置恰好是 `{ schemaVersion, enabled, deception, allowlist }`。加载时会迁移到这个形状：`enabled` 是故障安全的（任何非布尔值都表示**防护开启**），`deception` 为严格的显式选择启用，`allowlist` 会被校验为小写的 32 字符 ID。旧的或损坏的配置会被原地、幂等地升级。

---

## 📦 安装（本地加载）

目前还没有商店上架 —— 以未打包方式运行。`npm run build` 会在 `dist/` 中产出两个 zip：`…-chrome-<version>.zip` 和 `…-firefox-<version>.zip`。它们共享完全相同的代码，只有 manifest 不同（Firefox 使用 event-page 后台并声明不收集数据）。

**Chrome / Chromium（111+）：**

1. 取得 Chrome 文件夹（解压 `…-chrome-<version>.zip`，或克隆本仓库并运行 `npm install && npm run build:src` —— 扩展用 TypeScript 编写，这会把 `src/*.ts` 编译成 manifest 加载的 `src/*.js`）。
2. 打开 `chrome://extensions` → 打开右上角的**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择包含 `manifest.json` 的文件夹。

**Firefox（140+）：**

1. 解压 `…-firefox-<version>.zip`。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. 点击**临时载入附加组件…**，选择其中的 `manifest.json`。

无论哪种方式，🛡 图标都会出现在工具栏 —— 点击它即可切换防护，并查看每个标签页的扫描计数。

> `.zip` 无法直接安装 —— 请先解压。Firefox 需要 140+，Chrome/Chromium 需要 111+（都因为 MAIN-world content script）。

## 🧪 开发与测试

```sh
npm install
npm run typecheck   # 类型检查整个仓库（src + tools + tests）
npm run build:src   # 把 src/*.ts 编译为 src/*.js（浏览器加载的输出）
npm test            # 单元 + 集成（vitest + jsdom；先编译 src）
npm run test:e2e    # 系统测试（Playwright；首次先运行 `npx playwright install chromium`）
npm run build       # 编译后在 dist/ 产出可加载的 zip
```

整个代码库都是 TypeScript。扩展保持无打包器的 classic-script 架构：`src/*.ts` 通过 `tsc` 1:1 编译为 `src/*.js`（已 gitignore），manifest 直接加载这些文件。工具和测试通过 `tsx`/vitest 以 TypeScript 形式运行，无需构建步骤。

测试是分层的：单元 + 集成（`tests/`）在 vitest 下运行，E2E 测试会在 Chromium 中加载真实的未打包扩展。Firefox 构建的 manifest 由 `tools/firefox-manifest.ts` 从 Chrome 版生成（单一事实来源），并通过 `web-ext lint` 校验。

## 🚧 状态

**v1.0 —— 稳定。** 配置 schema 已冻结（带原地迁移），被封堵的向量如上所述，每一项都有回归测试（单元 + 集成 + Chromium E2E）。以本地「加载已解压 / 临时载入附加组件」的 zip 形式分发；尚未在 Chrome Web Store 或 Firefox Add-ons 上架。

## 📄 许可证

MIT
