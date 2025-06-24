# 🧩 Chessmont - Bot Discord d'Échecs Collaboratif

Un bot Discord pour résoudre des puzzles d'échecs en équipe ou solo, alimenté par l'API Lichess.

![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

## ✨ Fonctionnalités

### 🎯 Puzzles Collaboratifs
- **Résolution en équipe** : Plusieurs utilisateurs peuvent collaborer sur le même puzzle
- **Progression partagée** : Chaque coup correct est attribué à son découvreur
- **5 niveaux de difficulté** : Très facile → Très difficile
- **Puzzles Lichess authentiques** : Intégration directe avec l'API Lichess

### 🎮 Interface Interactive
- **Modals pour jouer** : Interface intuitive pour saisir les coups
- **Boutons d'interaction** : Jouer, voir la solution, demander des indices
- **Images dynamiques** : Échiquier mis à jour en temps réel
- **Notation française** : Support automatique de la notation française/anglaise

### 💡 Système d'Indices Progressif
1. **Indice 1** : Nombre de coups nécessaires
2. **Indice 2** : Thèmes du puzzle (tactique, finale, etc.)
3. **Indice 3** : Première lettre du coup suivant

### 🔔 Système de Dénonciation
- **Indices utilisés** : Annonce publique quand quelqu'un demande un indice
- **Solution consultée** : Notification quand la solution est révélée
- **Coups corrects** : Célébration publique des réussites

### 🛠️ Outils Utilitaires
- **Commande `/fen`** : Visualisation rapide de positions FEN
- **Multi-serveurs** : Chaque serveur Discord a ses propres puzzles
- **Gestion d'erreurs robuste** : Messages d'erreur clairs et informatifs

## 🚀 Installation

### Prérequis
- Node.js (v22 ou plus récent)
- Un token de bot Discord
- Accès à l'API Lichess (gratuit)

### Configuration

1. **Cloner le projet**
```bash
git clone https://github.com/votre-nom/chessmont.git
cd chessmont
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configuration du bot**
Créez un fichier `config.json` :
```json
{
  "clientId": "VOTRE_CLIENT_ID",
  "guilds": [
    "idserveur", "idserveur2"
  ]
}
```

4. **Déployer les commandes**
```bash
node deploy.js
```

5. **Lancer le bot**
```bash
node index.js
```

## 📋 Commandes

### `/puzzle [difficulte]`
Lance un nouveau puzzle d'échecs collaboratif.

**Options de difficulté :**
- `Très facile` - Pour débuter
- `Facile` - Puzzles accessibles
- `Normal` - Difficulté équilibrée (défaut)
- `Difficile` - Pour les joueurs expérimentés
- `Très difficile` - Challenge maximum

**Exemple :**
```
/puzzle difficulte:Difficile
```

### `/fen <notation_fen>`
Affiche un échiquier à partir d'une notation FEN.

**Exemple :**
```
/fen fen:rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKQ - 0 1
```

## 🎯 Comment Jouer

1. **Lancez un puzzle** avec `/puzzle`
2. **Analysez la position** affichée dans l'image
3. **Cliquez sur "🎯 Jouer un coup"** pour ouvrir le modal
4. **Saisissez votre coup** en notation algébrique (ex: `Cf6`, `e4`, `O-O`)
5. **Collaborez** avec d'autres joueurs pour résoudre le puzzle !

### 💭 Notation Supportée
- **Française** : `R` (Roi), `D` (Dame), `T` (Tour), `F` (Fou), `C` (Cavalier)

## 📊 Architecture

```
📦 chessmont/
├── 📄 index.js              # Point d'entrée principal
├── 📄 deploy.js             # Déploiement des commandes
├── 📄 config.json           # Configuration multi-serveurs
├── 📁 src/
│   ├── 📁 commands/
│   │   └── 📁 normal/
│   │       ├── 📄 puzzle.js # Commande puzzle principale
│   │       └── 📄 fen.js    # Commande utilitaire FEN
│   └── 📁 events/
│       └── 📁 global/
│           └── 📄 commandExecutor.js # Gestionnaire d'interactions
└── 📄 README.md
```

## 🔧 Technologies Utilisées

- **[Discord.js](https://discord.js.org/)** - Bibliothèque Discord pour Node.js
- **[chess.js](https://github.com/jhlywa/chess.js)** - Moteur d'échecs JavaScript
- **[axios](https://axios-http.com/)** - Client HTTP pour les API
- **[Lichess API](https://lichess.org/api)** - Source des puzzles d'échecs
- **[FEN2Image API](https://fen2image.chessvision.ai/)** - Génération d'images d'échiquier

## 🤝 Contribution

Les contributions sont les bienvenues ! Pour contribuer :

1. Fork le projet
2. Créez votre branche feature (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📝 TODO

- [ ] Système de classement des joueurs
- [ ] Statistiques de résolution de puzzles
- [ ] Support des puzzles personnalisés
- [ ] Mode tournoi entre serveurs
- [ ] Intégration avec d'autres sites d'échecs

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🙏 Remerciements

- **[Lichess.org](https://lichess.org/)** pour leur API gratuite et leurs excellents puzzles
- **[Chess Vision](https://chessvision.ai/)** pour leur service de génération d'images d'échiquier
- La communauté Discord.js pour leur documentation exceptionnelle

---

<div align="center">
  <sub>Fait avec ❤️ pour la communauté d'échecs Discord</sub>
</div>
