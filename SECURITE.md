# Système de Sécurité — PARES Backend

## Vue d'ensemble

Le système détecte automatiquement les tentatives d'injection (SQL, XSS, path traversal, injection de commandes) sur toutes les routes `/api`. Chaque tentative est loguée en base de données. Au bout de **2 tentatives**, l'IP est bannie pour **72 heures**.

---

## Mise en place (première installation)

### 1. Exécuter le script de migration

**Depuis cmd.exe** (dans le dossier `pares-backend`) :

```cmd
"C:\xampp\mysql\bin\mysql.exe" -u root pares_db < src\migration_security_banned_ips.sql
```

Si ton compte MySQL a un mot de passe, ajoute `-p` :

```cmd
"C:\xampp\mysql\bin\mysql.exe" -u root -p pares_db < src\migration_security_banned_ips.sql
```

> ⚠️ Utiliser **cmd.exe** (pas PowerShell). PowerShell ne supporte pas la redirection `<` pour stdin.

Le script crée la table `banned_ips` et ajoute les colonnes `_path` sur toutes les tables de fichiers. Les `ADD COLUMN IF NOT EXISTS` garantissent qu'il peut être rejoué sans erreur.

### 2. Redémarrer le backend

```bash
npm run dev
# ou
node server.js
```

La table est aussi créée automatiquement via `BannedIp.sync()` au démarrage si elle n'existe pas.

---

## Fonctionnement

### Flux de détection

```
Requête entrante
  → Vérification : IP bannie ? → OUI → 403 "IP bannie pour Xh"
  → Analyse du contenu (body, params, query)
  → Pattern suspect détecté ?
      → NON → requête transmise normalement
      → OUI → 400 "Contenu suspect détecté"
             → Enregistrement dans banned_ips (attempts++)
             → Enregistrement dans audit_log (module: SECURITE)
             → attempts >= 2 → banned_until = maintenant + 72h
                              → action = IP_BANNIE
```

### Seuils configurables

| Paramètre | Valeur | Fichier |
|-----------|--------|---------|
| Tentatives avant ban | `2` | `src/middlewares/security.middleware.js` → `BAN_THRESHOLD` |
| Durée du ban | `72h` | `src/middlewares/security.middleware.js` → `BAN_DURATION_MS` |

---

## Types d'attaques détectées

| Catégorie | Patterns détectés |
|-----------|-------------------|
| **SQL Injection** | `UNION SELECT`, `DROP TABLE`, `' OR 1=1`, `--`, commentaires SQL, fonctions `EXEC`, `CAST`, `CONVERT` |
| **XSS** | `<script>`, `javascript:`, `onerror=`, `onload=`, `<iframe>`, `document.cookie`, `eval()` |
| **Path Traversal** | `../../`, encodages `%2e%2e`, accès à `/etc/passwd`, `/windows/system32` |
| **Injection de commandes** | `; ls`, `| cat`, `&& rm`, sous-shells `$()`, backticks |

---

## Base de données

### Table `banned_ips`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INT AUTO_INCREMENT | Identifiant |
| `ip_address` | VARCHAR(45) | Adresse IPv4 ou IPv6 (unique) |
| `attempts` | INT | Nombre de tentatives détectées |
| `last_pattern` | VARCHAR(255) | Dernier pattern d'attaque détecté |
| `banned_until` | DATETIME | Date/heure de fin du ban (NULL si pas encore banni) |
| `createdAt` | DATETIME | Première détection |
| `updatedAt` | DATETIME | Dernière mise à jour |

### Table `audit_log` (module SECURITE)

Chaque tentative génère une entrée dans `audit_log` :

| Champ | Valeur |
|-------|--------|
| `module` | `SECURITE` |
| `action` | `INJECTION_TENTATIVE` ou `IP_BANNIE` |
| `ip_address` | IP de l'attaquant |
| `details.pattern` | Type de pattern détecté |
| `details.attempts` | Nombre de tentatives au moment de l'événement |
| `details.path` | Route ciblée |
| `details.method` | Méthode HTTP |
| `details.bannedUntil` | Date de fin du ban (si IP_BANNIE) |

---

## API d'administration

Toutes ces routes nécessitent un token JWT avec le rôle `ADMIN`.

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/admin/security/banned` | Liste toutes les IPs surveillées/bannies |
| `GET` | `/api/admin/security/stats` | Statistiques (bans actifs, suspects, total tentatives, logs récents) |
| `PUT` | `/api/admin/security/banned/:id/unban` | Débannir une IP manuellement |
| `DELETE` | `/api/admin/security/banned/:id` | Supprimer une entrée |

---

## Interface administrateur

Accessible depuis le dashboard admin : **Sécurité** (menu sidebar).

La page affiche :
- **3 cartes stats** : IPs bannies actives / IPs suspectes / Total tentatives
- **Tableau des IPs** : statut (banni/suspect), type d'attaque, heures restantes, boutons Débannir/Supprimer
- **Feed des 20 dernières alertes** avec IP, type d'attaque et route ciblée

---

## Réponses HTTP retournées à l'attaquant

| Situation | Code | Message |
|-----------|------|---------|
| Contenu suspect détecté | `400` | `Requête refusée : contenu suspect détecté.` |
| IP bannie | `403` | `Accès refusé. Votre adresse IP est bannie pour Xh suite à des tentatives d'attaque.` |

---

## Fichiers concernés

```
pares-backend/
├── src/
│   ├── middlewares/
│   │   └── security.middleware.js       ← Détection + bannissement
│   ├── models/
│   │   └── BannedIp.js                  ← Modèle Sequelize
│   ├── services/
│   │   └── security.service.js          ← Logique métier (liste, unban, stats)
│   ├── controllers/
│   │   └── security.controller.js       ← Contrôleur REST
│   ├── routes/
│   │   └── security.routes.js           ← Routes /api/admin/security
│   └── migration_security_banned_ips.sql ← Script SQL de migration
│
pares-frontend/
└── src/features/dashboard/admin/
    └── securite/
        ├── securite.ts                  ← Composant Angular
        └── securite.html                ← Interface admin
```
