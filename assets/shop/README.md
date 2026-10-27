# Shop artwork

Shopkeeper portraits live separately in `assets/shopkeeper/`:

- `assets/shopkeeper/miku_shopkeeper.png`
- `assets/shopkeeper/teto_shopkeeper.png`

Transparent PNGs work best. Use a full-body or waist-up portrait with some space
around the silhouette. The shop uses the same portraits for its splash screen
and the department counter. Until these files exist, the current victory artwork
is shown automatically. No code changes are needed when you add the two files.

Product artwork lives in `assets/shop/items/miku/` and `assets/shop/items/teto/`.
These are independent from the default dancers in `assets/player/` and the
theme-transition artwork in `assets/splash/`.

## Add a product

The fixed catalogue lives in `shop-model.js`. Give each product a permanent unique
`id` so existing purchases keep working. Set `department`, `type` (`sprite` or
`accent`), `name`, integer XP `price`, `description`, and `image`. Sprites also
need `idle`, `bop`, and `effect` (`encore` for uncropped portraits, `hologram` for
the built-in glow, or `classic` for the original dancer framing).

Replace a product's image paths to sell new art without changing its identity.
All referenced assets must be committed to this repository. Include any new
assets in `sw.js` if they should also be available offline.

Purchases are local LifeOS cosmetics, not real payments. XP, ownership, and
loadouts are saved together in the existing LifeOS document, so regular LifeOS
backup/export and restore include the shop. Spending XP reduces only the
progress toward the next level, never the current level.

## Transparent character presentation

The existing shop entrance, counter, and product layouts display the PNG alpha
channel directly. LifeOS uses `assets/lifeos/sprite_*.png`
with `object-fit: contain`, no blend mode and no portrait border. Replace these
files in place as you finish transparent exports; keep their filenames. Character
artwork is never flattened or processed by the UI.
