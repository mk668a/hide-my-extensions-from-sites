# hide-my-extensions-from-sites 🛡

**[English](../../README.md) ・ [日本語](README.ja.md) ・ [简体中文](README.zh-CN.md) ・ [한국어](README.ko.md) ・ [Español](README.es.md) ・ Français**

<p align="center">
  <img src="../../store/assets/promo-marquee-1400x560.png" alt="Les sites vous identifient par vos extensions. Masquez toute la liste. Universel, local, gratuit : le uBlock de la vie privée contre l'énumération d'extensions." width="820">
</p>

**Hide my extensions from every site that scans.**

Les sites web peuvent lire en silence *quelles extensions de navigateur vous avez installées*. Ils demandent des URL `chrome-extension://{id}/{resource}` une par une et **énumèrent** vos extensions installées selon celles qui répondent : l'astuce révélée par le « BrowserGate » de LinkedIn. C'est un signal de fingerprinting puissant, exploitable pour le pistage, le ciblage et la censure.

`hide-my-extensions-from-sites` supprime cette énumération **sur tous les sites**, non pas par un correctif site par site, mais en bloquant la technique elle-même : un « uBlock de la vie privée ».

> En une phrase : **rendez votre liste d'extensions invisible pour tous les sites.**

---

## 😩 Pourquoi le construire

- **Les extensions sont une empreinte.** L'ensemble des extensions installées est un identifiant stable qui survit à la suppression des cookies.
- **Les défenses existantes sont trop locales.** Des outils comme browsergate-shield ne correspondent qu'aux ID précis de LinkedIn. Il n'existe aucune défense **universelle** dans Chrome contre d'autres sites utilisant la même technique.

---

## 🧱 Comment ça marche

1. **Intercepter les sondes `chrome-extension://` dans le MAIN world** — intercepter le sondage d'ID d'extension via `fetch` / `XHR` / DOM (balises `img`/`link`) / Workers / cache depuis un content_script.
2. **Masquer l'existence (défense passive)** — renvoyer une réponse uniforme « absent » afin que les extensions installées ne puissent pas être lues.
3. **Empoisonner l'énumération (tromperie active, mode optionnel)** — au lieu de simplement « absent », renvoyer une **fausse liste d'extensions** pour corrompre les résultats du scanner. Si la défense passive consiste à « ne rien laisser fuiter », ceci consiste à « leur faire avaler des mensonges ».
4. **Le voir à l'œuvre** — quand un site est pris en flagrant délit de scan, l'icône affiche un badge (p. ex. `🛡 12 scans blocked`) avec un journal en temps réel.

| Défense passive — masquer la liste | Mode tromperie — empoisonner le scan |
|:---:|:---:|
| ![Popup montrant des sondes d'extension bloquées sur l'onglet actuel](../../store/assets/screenshot-1-hero.png) | ![Popup renvoyant au scanner de faux résultats « installé »](../../store/assets/screenshot-2-deception.png) |

---

## 🥊 Comparaison

| | Portée | Tromperie active |
|---|---|---|
| browsergate-shield | LinkedIn uniquement | non |
| TrackPrivacy | universelle | non |
| **hide-my-extensions-from-sites** | **universelle (tous les sites)** | **oui (mode optionnel)** |

---

## 🔒 Périmètre

- **Aucun compte, aucun serveur, aucun cloud.** Tout s'exécute localement dans votre navigateur : déterministe, hors ligne, gratuit.
- **Liste d'autorisation pour les extensions de confiance.** Certaines extensions servent légitimement des ressources à la page ; ajoutez leur id dans le popup et leurs requêtes passent intactes.
- Cible : **Chrome / Chromium** (111+) et **Firefox** (140+), Manifest V3.

---

## 🎯 Modèle de menace et couverture

L'attaquant est une **page web** qui cherche à savoir quelles extensions vous avez installées en demandant des URL `chrome-extension://{id}/{resource}` (ou `moz-extension://…`) et en observant lesquelles se résolvent. Nous nous exécutons dans le MAIN world de la page à `document_start`, avant tout script de la page, et neutralisons chaque canal de requête qu'une page peut utiliser pour émettre ou observer une telle sonde.

**Vecteurs de sonde bloqués** (chacun a un test de régression) :

| Canal | Comment il est neutralisé |
|---|---|
| `fetch()` | les sondes vers des URL d'extension sont rejetées (ou falsifiées en mode tromperie) |
| `XMLHttpRequest` | l'`open()` vers une URL d'extension est redirigé vers une URL morte |
| `src`/`href` de `<img>` / `<script>` / `<link>` | le setter de propriété et `setAttribute` sont réécrits |
| `<iframe>` / `<object>` / `<embed>` | les setters `src` / `data` et `setAttribute` sont réécrits |
| `srcset` (`<img>` / `<source>`) | le setter et `setAttribute` sont réécrits |
| `xlink:href` de SVG `<use>` | `setAttributeNS` (avec espace de noms) est réécrit |
| CSS `url(extension://…)` | `setProperty` / `cssText` / `setAttribute("style")` sont nettoyés |
| `navigator.sendBeacon` | les beacons vers des URL d'extension sont abandonnés |
| `EventSource` | les flux vers des URL d'extension sont redirigés vers une URL morte |

**Frontière de confiance.** Le pont de l'ISOLATED world remet au MAIN world un nonce propre à chaque chargement avant l'exécution de tout script de la page ; chaque mise à jour de configuration doit le porter, via un canal de même origine (`'/'`). Une page hostile **ne peut donc pas falsifier un message pour désactiver la protection**, ni renifler le nonce.

**Limites connues (documentées, par conception) :**

- **`el.style.backgroundImage = …`** (propriété camelCase directe) est un *setter nommé natif* dans Chrome : il n'est pas sur `CSSStyleDeclaration.prototype`, donc impossible à patcher. De plus, CSS ne fournit aucun signal load/error, ce qui en fait un mauvais oracle d'énumération ; les chemins CSS basés sur des chaînes ci-dessus *sont* couverts.
- **Oracles temporels** (différences de latence `onload`/`onerror`) non normalisés : cela demande une conception, pas un simple correctif, et sort du périmètre de la 1.0.
- Un avertissement `web-ext` lint pour **Firefox-for-Android** (plancher de clé de collecte de données) ; il s'agit d'une compilation destinée au bureau.

**Schéma de configuration (gelé en v1).** La configuration stockée est exactement `{ schemaVersion, enabled, deception, allowlist }`. Au chargement, elle est migrée vers cette forme : `enabled` est à sécurité intégrée (toute valeur non booléenne signifie **protection activée**), `deception` est strictement opt-in, et `allowlist` est validée en ids minuscules de 32 caractères. Les configurations anciennes ou corrompues sont mises à niveau sur place, de manière idempotente.

---

## 📦 Installation (chargement local)

Pas encore de fiche sur le store : exécutez-la décompressée. `npm run build` produit deux zips dans `dist/` : `…-chrome-<version>.zip` et `…-firefox-<version>.zip`. Ils partagent le même code ; seul le manifest diffère (Firefox utilise un arrière-plan de type event-page et déclare ne collecter aucune donnée).

**Chrome / Chromium (111+) :**

1. Récupérez le dossier Chrome (décompressez `…-chrome-<version>.zip`, ou clonez le dépôt et lancez `npm install && npm run build:src` — l'extension est écrite en TypeScript ; cela compile `src/*.ts` vers les `src/*.js` que charge le manifest).
2. Ouvrez `chrome://extensions` → activez le **Mode développeur** (en haut à droite).
3. Cliquez sur **Charger l'extension non empaquetée** et choisissez le dossier qui contient `manifest.json`.

**Firefox (140+) :**

1. Décompressez `…-firefox-<version>.zip`.
2. Ouvrez `about:debugging#/runtime/this-firefox`.
3. Cliquez sur **Charger un module complémentaire temporaire…** et choisissez le `manifest.json` à l'intérieur.

Dans les deux cas, l'icône 🛡 apparaît dans la barre d'outils ; cliquez dessus pour basculer la protection et voir le nombre de scans par onglet.

> Un `.zip` ne s'installe pas directement : décompressez-le d'abord. Firefox exige 140+ et Chrome/Chromium exige 111+ (les deux pour les content scripts du MAIN world).

## 🧪 Développement et tests

```sh
npm install
npm run typecheck   # vérifie les types de tout le dépôt (src + tools + tests)
npm run build:src   # compile src/*.ts → src/*.js (la sortie chargée par le navigateur)
npm test            # unitaires + intégration (vitest + jsdom ; compile src d'abord)
npm run test:e2e    # test système (Playwright ; lancez `npx playwright install chromium` une fois)
npm run build       # compile, puis produit les zips chargeables dans dist/
```

Tout le code est en TypeScript. L'extension conserve une architecture sans bundler, à scripts classiques : `src/*.ts` est compilé 1:1 en `src/*.js` (dans gitignore) par `tsc`, et le manifest charge ces fichiers directement. Les outils et les tests tournent en TypeScript via `tsx`/vitest, sans étape de build.

Les tests sont en couches : unitaires + intégration (`tests/`) tournent sous vitest, et un test E2E charge la vraie extension décompressée dans Chromium. Le manifest de la compilation Firefox est généré à partir de celui de Chrome par `tools/firefox-manifest.ts` (source unique de vérité) et validé par `web-ext lint`.

## 🚧 Statut

**v1.0 — stable.** Le schéma de configuration est gelé (avec migration sur place) et les vecteurs bloqués sont documentés ci-dessus, chacun avec un test de régression (unitaire + intégration + E2E Chromium). Distribuée sous forme de zip local « Charger l'extension non empaquetée / Charger un module temporaire » ; pas encore publiée sur le Chrome Web Store ni sur Firefox Add-ons.

## 📄 Licence

MIT
