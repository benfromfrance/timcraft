# TimCraft — jeu voxel sandbox pour le web

Jeu de construction/exploration en voxels (genre « bac à sable cubique ») jouable dans le navigateur.
Identité propre : nom, textures, blocs et sons originaux. Ne pas reprendre d'assets, de noms de marque
ou de textures provenant d'autres jeux.

## Stack technique

| Rôle | Choix | Pourquoi |
|------|-------|----------|
| Langage | **TypeScript** (strict) | Typage des données de blocs/chunks, refactors sûrs |
| Build / dev server | **Vite** | HMR rapide, support natif des Web Workers (`?worker`) |
| Rendu 3D | **Three.js** (WebGL2) | Mature, bien documenté, suffisant pour du voxel |
| Bruit procédural | **simplex-noise** | Génération de terrain (hauteur, grottes, biomes) |
| Aléatoire déterministe | **alea** (PRNG seedé) | Même seed ⇒ même monde |
| Sauvegarde | **IndexedDB** via **idb-keyval** | Stockage des chunks modifiés côté client |
| UI (HUD, menus) | HTML/CSS par-dessus le canvas | Simple ; pas de framework UI au début |
| Tests | **Vitest** | Logique pure (chunks, meshing, physique) |
| Qualité | **ESLint** + **Prettier** | Style homogène |

Pas de moteur physique externe : la physique voxel (AABB contre grille) est plus simple et plus rapide à la main.

## Commandes

```bash
npm install          # installer les dépendances
npm run dev          # serveur de dev (http://localhost:5173)
npm run build        # build de production dans dist/
npm run preview      # prévisualiser le build
npm run test         # tests Vitest
npm run lint         # ESLint
```

## Architecture

```
src/
  main.ts                 # point d'entrée : crée le renderer, la boucle de jeu
  core/
    Game.ts               # boucle principale (physique à pas fixe 60 Hz + rendu interpolé)
    Input.ts              # clavier/souris, Pointer Lock
    Gamepad.ts            # manette (Gamepad API, mapping standard Xbox), lue à chaque frame
    Settings.ts           # distance de rendu, FOV, sensibilité
  world/
    World.ts              # chunks chargés, get/setBlock en coordonnées monde (sans Three.js)
    ChunkStreamer.ts      # chargement/déchargement autour du joueur via les workers
    coords.ts             # conversions monde ↔ chunk (négatifs gérés)
    DayNight.ts           # cycle jour/nuit (10 min) : lumière, couleur du ciel, heure
    Chunk.ts              # données d'un chunk (Uint8Array/Uint16Array), `revision` incrémentée à chaque édition
    surface.ts            # bloc le plus haut de chaque colonne (mini-carte)
    blocks.ts             # registre des types de blocs (id, nom, solide, transparent, textures)
    generation/
      TerrainGenerator.ts # heightmap, biomes, grottes, arbres
      blueprint.ts        # bâtiment = volume de blocs pur + estampillage dans les chunks (terrain nivelé autour)
      castle.ts           # plan du château (nord du spawn)
      fortress.ts         # plan de la Forteresse noire (à l’est) : 9 salles piégées
      citadel.ts          # plan de la Citadelle maudite (à l’ouest) : que des pièges, aucun monstre
    meshing/
      mesher.ts           # construction des géométries (faces visibles + ambient occlusion)
  workers/
    chunk.worker.ts       # génération + meshing hors du thread principal
    WorkerPool.ts         # pool de workers, API à promesses
  render/
    Renderer.ts           # scène Three.js, caméra, lumière, brouillard
    TextureAtlas.ts       # atlas 16×16 peint procéduralement au démarrage (textures originales)
    ChunkRenderer.ts      # un Mesh Three.js par chunk, libération GPU au déchargement
    ViewModel.ts          # bras arrondi + objet tenu à la 1re personne (scène éclairée par-dessus le monde)
    BlockParticles.ts     # éclats texturés quand on casse un bloc (pool fixe, aucune allocation)
    shadedBox.ts          # boîte avec ombrage par face (même rendu que les chunks, sans lumières)
  items/
    items.ts              # objets non posables (id ≥ 256) : bâton, armes (dégâts, cadence, usure)
  mobs/
    mobTypes.ts           # types de monstres (data-driven) : stats, apparition jour/nuit, modèle
    mobAI.ts              # logique pure : poursuite en ligne droite, saut si bloqué, errance
    MobManager.ts         # apparition/disparition, physique, attaques, bond, feu et rage la nuit
    MobModel.ts           # rig générique en boîtes (pattes, bras, yeux) + animations
    HealthBar.ts          # barre de vie (sprite) au-dessus d’un monstre touché, s’efface après 5 s
    Flames.ts             # particules de feu (géométrie/matériaux partagés)
  castle/
    Castle.ts             # épreuves du château : zones déclencheuses, arène à vagues, piège, coffres, gardien
    Fortress.ts           # pièges de la forteresse : dalles friables, piques rythmées, herse chronométrée,
                          # faux coffre, gardien unique, points de réapparition
    Citadel.ts            # pièges de la citadelle : flèches, pont invisible, dalles fantômes, vent,
                          # pluie de pierres, dalles à piques cachées, effondrement final
    Projectiles.ts        # flèches et pierres (pools fixes)
    traps.ts              # mécanismes partagés : dalles friables, rythmes, portes
  crafting/
    recipes.ts            # recettes (data-driven) : entrées, sortie, besoin d’un établi
    Crafting.ts           # logique pure : vérifie, consomme, ajoute (rollback si plein)
  player/
    Player.ts             # position, vélocité, état (au sol, vol)
    Inventory.ts          # barre de 9 piles (64 max) en mode survie
    Physics.ts            # collisions AABB vs voxels, gravité, saut
    Raycast.ts            # visée de bloc (algorithme DDA / Amanatides-Woo)
  ui/
    Hud.ts                # viseur, barre d'objets, debug (F3)
    CraftingMenu.ts       # écran de fabrication (liste de recettes, souris/clavier/manette)
    icons.ts              # icônes de blocs dessinées depuis l’atlas
    Minimap.ts            # mini-carte vue du dessus (tuiles 16×16 par chunk en cache, joueur, monstres, spawn)
    Menus.ts              # menu principal, pause
  storage/
    SaveManager.ts        # sérialisation des chunks modifiés dans IndexedDB
public/
  sounds/
tests/
```

## Conventions du monde

- **Chunk** : 16 × 16 (X/Z) × 256 (Y) — ou sections de 16³ si la hauteur devient un problème de perf.
- Stockage : tableau typé plat, index = `x + z * 16 + y * 256`. Bloc `0` = air.
- Coordonnées : Y vers le haut. Clé de chunk : `"cx,cz"`. Conversion monde → chunk avec
  `Math.floor(x / 16)` (attention aux négatifs, ne jamais utiliser `| 0` ni `%` seul).
- Les blocs sont décrits dans `blocks.ts` uniquement (data-driven) ; aucun id en dur ailleurs.

## Règles de performance (importantes)

1. **Ne jamais générer ni mailler un chunk sur le thread principal** → Web Worker ; transférer
   les buffers avec `postMessage(data, [buffer])` (transferable, pas de copie).
2. Suppression des faces cachées (ne dessiner que les faces adjacentes à l'air/transparent) — fait.
   **Greedy meshing** : optimisation future ; nécessite des `texture arrays` ou un shader qui répète
   la tuile, car l'atlas ne permet pas d'étirer une texture sur plusieurs blocs.
3. **Une seule texture atlas** + un seul matériau opaque et un matériau transparent ⇒ peu de draw calls.
4. Remeshing incrémental : quand un bloc change, ne remailler que son chunk (et le voisin si en bordure).
5. Charger/décharger les chunks selon la distance de rendu, par ordre de proximité ; `dispose()`
   les géométries Three.js déchargées pour éviter les fuites GPU.
6. Ambient occlusion par sommet calculée au meshing (bon rendu, coût nul au runtime).
7. Pas d'allocation dans la boucle de jeu (réutiliser les `Vector3`, etc.).
8. Objectif : 60 FPS avec une distance de rendu de 8 chunks sur un laptop moyen.

## Gameplay — feuille de route

1. **MVP** : terrain généré par seed, déplacement FPS (ZQSD/WASD + souris, ou manette Xbox), collisions, saut,
   casser (clic gauche) / poser (clic droit) un bloc, barre d'objets 1–9.
2. Sauvegarde/chargement du monde (IndexedDB), menu pause.
3. Éclairage par blocs (torches, propagation de lumière en BFS), eau. Fait : cycle jour/nuit
   (assombrissement global, ciel, soleil, lune, étoiles).
4. Biomes, arbres, grottes, minerais.
5. Inventaire complet (sac à dos), sons, outils de minage. Fait : ramassage des blocs (survie),
   mode créatif, établi et fabrication par liste de recettes, armes, 3 types de monstres
   (Rôdeur, Bondisseur, Colosse) embrasés et enragés la nuit, vie et mort, mini-carte,
   château de départ (labyrinthe, gouffre, arène, crypte piégée, salle secrète, gardien),
   Forteresse noire plus dure (pièges, piques qui blessent, 2 monstres seulement, points de réapparition),
   Citadelle maudite, la plus dure (aucun monstre, uniquement des pièges).
   Les blocs du château (`unbreakable`) sont indestructibles en survie et on ne peut pas construire
   dans les salles d'épreuves : sinon on contournerait les épreuves.
6. (Optionnel) Multijoueur : serveur Node.js + WebSocket (`ws`), serveur autoritaire.

## Règles pour l'assistant

- Code en TypeScript strict, modules ES, pas de `any` sans justification.
- Garder la logique (world, physics, meshing) indépendante de Three.js quand c'est possible → testable avec Vitest.
- Écrire des tests pour : indexation des chunks, conversions de coordonnées (y compris négatives),
  raycast, collisions.
- Avant d'ajouter une dépendance, vérifier qu'elle est vraiment nécessaire.
- Commentaires et noms de variables en anglais ; textes affichés au joueur en français.
- En dev, l'instance du jeu est exposée en `window.game` (console, vérifications automatisées).
- Ids : 0–255 = blocs (`BlockId`, posables), ≥ 256 = objets (`ItemId`). L'inventaire stocke les deux.
