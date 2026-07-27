# CanShop visual system

The production UI follows the supplied CanShop identity: deep forest surfaces, fresh green accents, clean white type, rounded premium controls, and a shopping-bag plus cannabis-leaf mark.

## Core palette

| Token | Hex | Use |
|---|---:|---|
| Forest 950 | `#06120D` | App background, status and navigation bars |
| Forest 850 | `#0F241C` | Primary surfaces |
| Forest 700 | `#1F4935` | Elevated surfaces and gradients |
| Green 700 | `#2E7D32` | Deep leaf details |
| Green 600 | `#5BAA47` | Secondary accent |
| Green 500 | `#7BC043` | Primary action gradient |
| Green 400 | `#8BC34A` | Highlights, active states, status indicators |
| Lime 300 | `#B8C34A` | Number markers and premium highlights |
| Mint 100 | `#E8F5E9` | Soft foreground |
| White | `#FFFFFF` | High-contrast foreground |
| Muted | `#A8B5A1` | Secondary text |

## Type scale

- Display: 40 to 62 px, bold, tight tracking
- H2: 24 to 32 px, bold
- H3: 18 px, semibold
- Body: 14 px with 1.58 line height
- Labels: 8 to 11 px, uppercase, generous tracking

The font stack prefers Inter and falls back to Android system sans fonts without a network dependency.

## Shape language

- Main panels: 28 px radius
- Product cards: 22 px radius
- Inputs and buttons: 14 to 15 px radius
- Pills and statuses: fully rounded
- Launcher art: rounded-square silhouette suitable for Android masking

## Icon family

- `app/src/main/res/drawable/ic_launcher.xml`: main dark bag and leaf icon
- `app/src/main/res/drawable/ic_launcher_leaf.xml`: circular leaf alternative
- `app/src/main/res/drawable/ic_launcher_bag.xml`: light shopping-bag alternative
- `app/src/main/assets/brand-mark.svg`: in-app brand mark and wordmark companion

## Component treatment

The theme is applied to the legal-age gate, sticky app bar, hero, metric markers, filters, form controls, statuses, product cards, price blocks, empty state, extraction method cards, dialog, footer, and bottom navigation.
