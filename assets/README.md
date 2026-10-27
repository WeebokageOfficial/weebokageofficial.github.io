# Artwork folders

| Folder | Purpose |
| --- | --- |
| `lifeos/` | LifeOS module companion PNGs (`sprite_lifestyle.png`, `sprite_teto.png`, etc.) |
| `shopkeeper/` | `miku_shopkeeper.png` and `teto_shopkeeper.png` for the existing Shop counter and entrance |
| `shop/items/miku/` | Purchasable Miku sprite art: `encore.png`, `hologram_idle.png`, `hologram_bop.png` |
| `shop/items/teto/` | Purchasable Teto sprite art, with the same filenames |
| `player/` | Default Miku/Teto dancers: `*_bop.png` and `*_bop_idle.png` |
| `avatars/` | `mikukage.png` and `tetokage.png`: theme companion portraits |
| `profile/` | Your personal homepage `profile.png`, independent of companion themes |
| `books/` | Public artwork only; confidential book covers belong outside this repository |
| `splash/` | Miku/Teto theme entrance and victory artwork |
| `wallpapers/` | Wallpapers and their WebP variants; `wallpaper 2.png` is now `wallpaper-2.png` |

Keep filenames stable when exporting transparent replacements. The renderer
uses the PNG alpha channel directly; it never flattens or edits your artwork.
Shop product files are deliberately independent copies: editing a purchased
sprite will not change the free player sprites or the theme splash art.

## Code references

- `lifeos.js`, `lifeos.html`: LifeOS companion art.
- `shop.js`: shopkeeper portraits, falling back to theme victory artwork.
- `shop-model.js`: product art and the fixed product IDs. Preserve IDs to keep
  existing purchases and equipped items valid.
- `global-ui.js`: default player animation frames and equipped shop sprites.
- `theme.js`, `theme-splash.js`, `index.html`: theme entrance/victory artwork.
- `theme.css`, `lifeos.css`: profile images and wallpapers.
- `manifest.json`: app icons.
- `sw.js`: offline asset list. Update it when adding new artwork.

The Android platform-tools and game/vendor assets are not character artwork and
remain in their existing locations. No LifeOS sprites remain inside platform-tools.

Brand marks: `brands/amazon.svg` is the Amazon mark distributed by Simple Icons v11 (https://github.com/simple-icons/simple-icons/tree/11.0.0), used for the Amazon purchase link.
