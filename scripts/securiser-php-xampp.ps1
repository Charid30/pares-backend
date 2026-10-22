# securiser-php-xampp.ps1 — Ferme /php-cgi/ et désactive PHP dans l'Apache de XAMPP (failles PHP2Shell,
# CVE-2026-109618/109619, et CVE-2024-4577). PARES n'utilise pas PHP : frontend statique, API Node.js.
#
# Usage (PowerShell en administrateur, sur le serveur) :
#   powershell -ExecutionPolicy Bypass -File .\securiser-php-xampp.ps1
#   powershell -ExecutionPolicy Bypass -File .\securiser-php-xampp.ps1 -SeulementPhpCgi   # garder PHP, fermer /php-cgi/
# Un clic droit « Exécuter avec PowerShell » fonctionne aussi : la fenêtre attend Entrée avant de se fermer.
#
# Le script : sauvegarde la configuration, la modifie, vérifie la syntaxe (httpd -t), restaure la sauvegarde
# si la vérification échoue, puis affiche le résumé de ce qui a été fait. Il ne redémarre PAS Apache.
# Relançable sans risque : les lignes déjà désactivées ne sont pas modifiées.
param(
    [string]$Conf  = 'C:\xampp\apache\conf\extra\httpd-xampp.conf',
    [string]$Httpd = 'C:\xampp\apache\bin\httpd.exe',
    [switch]$SeulementPhpCgi,
    [switch]$SansVerification,  # tests uniquement (copie du fichier) : ne lance pas httpd -t
    [switch]$SansPause          # tests uniquement : ne pas attendre Entrée à la fin
)

function Ecrire-Titre($texte) { Write-Host ''; Write-Host "=== $texte ===" -ForegroundColor Cyan }

$actions = New-Object System.Collections.Generic.List[string]   # résumé de ce qui a été fait
$sauvegarde = $null

try {
    $ErrorActionPreference = 'Stop'
    Ecrire-Titre 'Sécurisation de PHP dans Apache (XAMPP)'

    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) {
        Write-Host "Attention : PowerShell n'est pas lancé en administrateur ; l'écriture du fichier peut être refusée." -ForegroundColor Yellow
    }
    if (-not (Test-Path $Conf)) { throw "Fichier introuvable : $Conf" }
    Write-Host "Fichier : $Conf"
    Write-Host ("Mode    : " + $(if ($SeulementPhpCgi) { 'fermer seulement /php-cgi/ (PHP conservé)' } else { 'fermer /php-cgi/ et désactiver PHP' }))

    $lignes = [System.IO.File]::ReadAllLines($Conf)
    $sortie = New-Object System.Collections.Generic.List[string]
    $dansFilesPhpCgi = $false

    for ($i = 0; $i -lt $lignes.Count; $i++) {
        $l = $lignes[$i]
        $t = $l.Trim()
        $n = $i + 1
        $suivante = if ($i + 1 -lt $lignes.Count) { $lignes[$i + 1].Trim() } else { '' }

        # 1. /php-cgi/ : alias vers le dossier de PHP
        if ($t -match '^ScriptAlias\s+/php-cgi/') {
            $sortie.Add("#$l"); $actions.Add("Ligne $n : alias /php-cgi/ désactivé"); continue
        }
        # 2. Bloc qui autorise l'exécution de php-cgi.exe
        if ($t -match '^<Files\s+"php-cgi\.exe">') { $dansFilesPhpCgi = $true; $actions.Add("Ligne $n : autorisation de php-cgi.exe désactivée") }
        if ($dansFilesPhpCgi) {
            $sortie.Add("#$l")
            if ($t -match '^</Files>') { $dansFilesPhpCgi = $false }
            continue
        }

        if (-not $SeulementPhpCgi) {
            # 3. Module PHP (mod_php) et ses bibliothèques
            if ($t -match '^(LoadFile\s+"C:/xampp/php/|LoadModule\s+php_module\b)') {
                $mots = $t -split '\s+'
                $sortie.Add("#$l"); $actions.Add("Ligne $n : $($mots[0]) désactivé ($($mots[-1].Trim('"')))"); continue
            }
            # 4. Exécution des .php / .phps → accès refusé (sinon Apache enverrait le code source en clair)
            if ($t -eq '<FilesMatch "\.php$">' -and $suivante -eq 'SetHandler application/x-httpd-php') {
                $sortie.Add('<FilesMatch "\.(php|phps)$">')
                $sortie.Add('    Require all denied')
                $sortie.Add('</FilesMatch>')
                $i += 2; $actions.Add("Ligne $n : fichiers .php et .phps bloqués (Require all denied)"); continue
            }
            if ($t -eq '<FilesMatch "\.phps$">' -and $suivante -eq 'SetHandler application/x-httpd-php-source') {
                $sortie.Add("#$l"); $sortie.Add("#$($lignes[$i + 1])"); $sortie.Add("#$($lignes[$i + 2])")
                $i += 2; $actions.Add("Ligne $n : affichage du code .phps désactivé"); continue
            }
        }
        $sortie.Add($l)
    }

    Ecrire-Titre 'Résumé'
    if ($actions.Count -eq 0) {
        Write-Host 'Rien à modifier : la configuration est déjà sécurisée. Aucun fichier changé.' -ForegroundColor Green
    } else {
        $sauvegarde = "$Conf.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item $Conf $sauvegarde
        [System.IO.File]::WriteAllLines($Conf, $sortie, (New-Object System.Text.UTF8Encoding($false)))

        $verifOk = $true
        $messageVerif = 'non lancée (test)'
        if (-not $SansVerification) {
            # httpd écrit sur la sortie d'erreur, même quand tout va bien : passer par cmd
            $messageVerif = (cmd /c "`"$Httpd`" -t 2>&1") -join ' '
            $verifOk = ($LASTEXITCODE -eq 0)
        }

        if (-not $verifOk) {
            Copy-Item $sauvegarde $Conf -Force
            Write-Host 'ÉCHEC de la vérification Apache : AUCUN changement conservé, configuration d''origine restaurée.' -ForegroundColor Red
            Write-Host "Message d'Apache : $messageVerif"
        } else {
            Write-Host "$($actions.Count) modification(s) appliquée(s) :" -ForegroundColor Green
            $actions | ForEach-Object { Write-Host "  - $_" }
            Write-Host ''
            Write-Host "Vérification Apache : $messageVerif" -ForegroundColor Green
            Write-Host "Sauvegarde          : $sauvegarde"
            Ecrire-Titre 'À faire maintenant'
            Write-Host '  1. Redémarrer Apache (panneau XAMPP : Stop puis Start).'
            Write-Host '  2. Ouvrir https://portail.sonabhy.bf/php-cgi/php-cgi.exe : la page 404 du portail doit s''afficher.'
            Write-Host '  3. Tester l''accueil, une connexion et un téléchargement.'
            Write-Host "  Retour arrière : Copy-Item '$sauvegarde' '$Conf' -Force  (puis redémarrer Apache)"
        }
    }
}
catch {
    Ecrire-Titre 'Erreur'
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($sauvegarde -and (Test-Path $sauvegarde)) {
        Copy-Item $sauvegarde $Conf -Force
        Write-Host 'Configuration d''origine restaurée depuis la sauvegarde.' -ForegroundColor Yellow
    } else {
        Write-Host 'Aucun fichier n''a été modifié.' -ForegroundColor Yellow
    }
}
finally {
    if (-not $SansPause) { Write-Host ''; Read-Host 'Appuyez sur Entrée pour fermer' | Out-Null }
}
