# Gewicht Mania (prototype)

Playable 2-player prototype of Gewicht Mania. Runs entirely in the browser; the
two players connect directly to each other over WebRTC, so there is no server to
run or pay for.

## Lancer le projet

```bash
bun install
bun run dev
```

Puis <http://localhost:5173>.

| Commande | Effet |
| --- | --- |
| `bun run dev` | serveur de développement |
| `bun run build` | build de production dans `dist/` |
| `bun run typecheck` | vérification TypeScript |
| `bun run src/engine/sim.ts 2000` | simule 2000 parties et vérifie les invariants de règles |

## Les trois modes

- **Créer une partie** : tu es le siège A, un code à 5 lettres s'affiche, tu le transmets à ton adversaire.
- **Rejoindre** : tu entres le code, tu es le siège B.
- **Partie locale** : un seul écran, avec un rideau quand on se passe l'appareil. Pratique pour tester les règles seul.

## Connexion entre deux joueurs

WebRTC perce les NAT tout seul : **aucune redirection de port n'est nécessaire**.
Le code de partie transite par le broker public de PeerJS, puis les deux
navigateurs se parlent directement.

Ça marche entre deux connexions fixes dans la très grande majorité des cas. Ça
échoue souvent dès qu'un joueur est en 4G/5G, parce que les opérateurs mobiles
utilisent du CGNAT symétrique où le hole punching ne passe pas. La solution est
un relais TURN. Pas besoin d'en héberger un, il y a des offres gratuites :

1. Crée des identifiants TURN chez **Cloudflare** (dashboard → Calls → TURN keys)
   ou **Metered** (50 Go/mois gratuits).
2. `cp .env.example .env.local` et remplis les trois variables.
3. Relance `bun run dev`.

L'écran d'accueil indique si TURN est configuré ou non.

## Héberger la version jouable

Le dépôt peut rester **privé**. Attention : GitHub Pages sur un dépôt privé
demande un plan payant. Utilise plutôt **Cloudflare Pages** ou **Vercel**, qui
déploient depuis un dépôt privé gratuitement.

Sur Cloudflare Pages : *Connect to Git* → ce dépôt → build command `bun run build`,
output directory `dist`. Ajoute les variables `VITE_TURN_*` dans les settings du
projet si tu utilises TURN.

## Direction artistique

Tout part de la photo de TGV Duplex dans `src/assets/train.webp` : elle sert
d'image d'accueil et de vignette sur chaque panneau de train, et les jetons de
couleur de `styles.css` en sont tirés (bleu SNCF, argent brossé, carmin et corail
des portes, ciel d'été, or des champs). Le dos des cartes reprend la livrée
argent sur bleu avec la bande corail.

Pour changer d'image, remplace le fichier par `src/assets/train.<jpg|png|webp>`.
Il est résolu par un glob dans `src/ui/photo.ts`, donc l'application continue de
fonctionner si le fichier est absent : elle affiche un bandeau de remplacement.

Les icônes viennent de `lucide-react`, y compris les quatre enseignes qui servent
aussi de statistiques de train. Aucun caractère unicode n'est utilisé comme
icône.

> La photo est un visuel de banque d'images. Vérifie la licence avant toute
> diffusion publique du prototype.

## Architecture

Trois couches, volontairement étanches :

```
src/engine/   machine à états pure, aucune notion de React, de réseau, de timer
src/net/      transport : hot-seat local ou WebRTC. Les actions sont du JSON.
src/ui/       rendu et interactions
```

- **`engine/game.ts`** contient `reduce(state, action) -> state`. Toutes les règles
  sont là et nulle part ailleurs.
- **`engine/config.ts`** contient chaque décision de règle qui aurait pu être
  tranchée autrement. C'est le fichier à ouvrir entre deux playtests.
- **`engine/redact.ts`** retire d'un état tout ce qu'un joueur n'a pas le droit de
  voir. C'est la seule chose qui sépare un joueur de la main adverse : toute
  nouvelle information secrète doit y être traitée.
- **`net/session.ts`** : l'hôte fait autorité, l'invité n'a qu'une vue expurgée et
  envoie des actions. Comme une action est du JSON, passer à un vrai serveur plus
  tard veut dire remplacer ce fichier et rien d'autre.

Le RNG est déterministe et sa graine vit dans l'état, donc une partie entière est
rejouable à l'identique à partir de sa graine.

## Décisions de règles

Les points que le texte des règles laissait ouverts, et ce qui a été retenu. Tous
sont configurables dans `engine/config.ts`.

| Point | Décision |
| --- | --- |
| Sens de lecture de la rivière | Toujours de gauche à droite. |
| Mises à égalité | La carte reste dans la rivière et n'est départagée qu'à la fin, au duel. |
| Plafond de 4 cartes | Dès qu'un joueur atteint 4 cartes (pendant l'évaluation **ou** lors d'un duel), toutes les cartes restantes vont à l'adversaire. Le partage est donc toujours 4/4. |
| Repioche après un duel de rivière | Immédiate, une carte par carte jouée, avant le duel suivant. |
| Statistiques des trains | Réinitialisées à chaque manche : les dégâts ne se cumulent pas d'une manche à l'autre. La variante « les dégâts persistent » est prête, il suffit de passer `resetStatsEachRound` à `false`. |
| Timer de mise | 60 s, et les mises non posées sont attribuées au hasard à l'expiration. |
| Duel supplémentaire sans cartes | Si aucun des deux joueurs ne peut surenchérir, le duel est nul et aucune attaque n'a lieu. Sur la rivière, la carte va au joueur le moins avancé, ou est défaussée en cas d'égalité parfaite. |
| Ordre buff / dégâts | Les buffs sont révélés et appliqués **avant** les dégâts : un buff peut sauver une statistique. |
| Buffs | Les deux joueurs peuvent buffer la même statistique, et buffer une statistique non attaquée. |
| Trains | Aléatoires pour le prototype (nom tiré d'une liste, stats entre 10 et 30). Le vrai deck se branche dans `engine/cards.ts` sans toucher au reste. |

## Vérification

`bun run src/engine/sim.ts` joue des parties complètes en coups aléatoires et
vérifie à chaque manche que :

- chaque joueur repart de la rivière avec exactement 4 cartes ;
- chaque joueur entre en phase de duel avec `3 + n° de manche + 3` cartes (7, 8, 9…) ;
- après le buff et les attaques, il reste exactement 3 cartes en main ;
- la partie se termine.

Sur 2000 parties : aucune violation, 45,7 % de victoires A, 44,7 % B, 9,6 %
d'égalités, médiane de 2 manches en jeu aléatoire.
