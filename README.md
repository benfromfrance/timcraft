# TimCraft

Jeu de construction et d'exploration en voxels, jouable directement dans le navigateur.
Monde généré à l'infini, survie, fabrication, monstres qui s'embrasent la nuit — au clavier/souris
ou à la manette Xbox.

> Toutes les textures sont peintes procéduralement au démarrage : aucun asset externe.

## Fonctionnalités

- **Monde infini** généré par graine (`?seed=...` dans l'URL), chargé par chunks dans des Web Workers
- **Survie** : on récupère les blocs en creusant, barre de 9 emplacements, vie et réapparition
- **Mode créatif** : blocs illimités et vol
- **Établi et fabrication** : planches, bâtons, verre, briques, épées, hache…
- **Combat** au corps à corps avec un bras visible à la 1re personne, armes avec usure
- **Retours visuels** : éclats de texture quand on casse un bloc, barre de vie au-dessus des monstres touchés
- **Un château** devant le point de départ, plein d'épreuves et de surprises : labyrinthe avec trésor caché,
  gouffre à franchir de pilier en pilier, arène à 3 vagues de monstres, sol piégé au-dessus d'une crypte,
  salle secrète, et un gardien embrasé qui se réveille quand on ouvre le trésor du roi
- **La Forteresse noire**, plus loin à l'est, bien plus dure : chemin d'or au-dessus d'une fosse à piques,
  piques rythmées, faux trésor piégé, course contre une herse, pont de dalles qui s'effritent et un gardien
  solitaire sur des passerelles — beaucoup de pièges, seulement deux monstres
- **La Citadelle maudite**, à l'ouest, la plus dure des trois : aucun monstre, rien que des pièges —
  couloir de flèches, pont invisible, dalles fantômes, pont balayé par le vent, pluie de pierres,
  labyrinthe aux dalles piégées, et une salle du trésor qui s'effondre derrière vous
- **3 monstres** : le Rôdeur, le Bondisseur (qui bondit sur vous) et le Colosse (lent mais redoutable)
- **Cycle jour/nuit** de 10 minutes : soleil, lune, étoiles — la nuit, les monstres s'embrasent et deviennent enragés
- **Mini-carte** vue du dessus avec relief, monstres, point de réapparition, coordonnées et heure
- **Manette Xbox** prise en charge (Gamepad API), avec vibrations

## Démarrer

Prérequis : [Node.js](https://nodejs.org/) 22 ou plus récent.

```bash
npm install
npm run dev
```

Puis ouvrir <http://localhost:5173>.

| Commande          | Rôle                                                       |
| ----------------- | ---------------------------------------------------------- |
| `npm run dev`     | serveur de développement                                   |
| `npm run build`   | vérification TypeScript + build de production dans `dist/` |
| `npm run preview` | prévisualiser le build                                     |
| `npm test`        | tests unitaires (Vitest)                                   |
| `npm run lint`    | ESLint                                                     |

## Commandes de jeu

| Action                      | Clavier / souris              | Manette Xbox                   |
| --------------------------- | ----------------------------- | ------------------------------ |
| Se déplacer                 | `Z Q S D` / `W A S D`         | stick gauche                   |
| Regarder                    | souris                        | stick droit                    |
| Sauter / courir             | `Espace` / `Maj`              | `A` / `B`                      |
| Mode vol                    | `F`                           | `Y`                            |
| Casser / frapper            | clic gauche                   | `RT`                           |
| Poser                       | clic droit                    | `LT`                           |
| Choisir un objet            | `1`–`9`, molette              | `LB` / `RB`                    |
| Fabrication                 | `E`, clic droit sur un établi | croix haut, `LT` sur un établi |
| Survie / créatif            | `C`                           | clic stick droit               |
| Passer au jour / à la nuit  | `T`                           | croix bas                      |
| Mini-carte (zoom / masquer) | `M`                           | —                              |
| Infos de debug              | `F3`                          | `Affichage`                    |
| Pause                       | `Échap`                       | `Menu`                         |

## Technologies

TypeScript · [Three.js](https://threejs.org/) · [Vite](https://vite.dev/) · simplex-noise · Vitest · ESLint · Prettier

L'architecture, les conventions et la feuille de route sont décrites dans [`CLAUDE.md`](CLAUDE.md).

## Licence

[MIT](LICENSE) © Benoit Defrance
