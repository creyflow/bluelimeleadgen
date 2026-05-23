# Script di Deploy per BlueLimeLeads
# Questo script compila il frontend in /dist, inizializza un git repository isolato in /dist
# e fa il push forzato sul repository GitHub designato per il deploy statico su Coolify.

# 1. Compilazione del progetto
Write-Host "🔨 Compilazione in corso..." -ForegroundColor Cyan
pnpm run build

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Compilazione fallita!"
    exit $LASTEXITCODE
}

# 2. Naviga nella cartella di build
cd dist

# 3. Inizializza git se non è già presente
if (-not (Test-Path .git)) {
    Write-Host "🗂️ Inizializzazione repository Git locale in /dist..." -ForegroundColor Cyan
    git init
    git checkout -b main
}

# 4. Aggiungi i file e committa
git add .
$dateStr = Get-Date -Format "yyyy-MM-dd HH-mm-ss"
git commit -m "Deploy build: $dateStr"

# 5. Configura il remote se non è già presente
$remote = git remote get-url origin 2>$null
if (-not $remote) {
    # Repository target predefinito per il deploy di solo /dist
    $targetRepo = "https://github.com/creyflow/bluelimeleads-dist.git"
    Write-Host "🌐 Aggiunta del remote origin: $targetRepo" -ForegroundColor Cyan
    git remote add origin $targetRepo
} else {
    Write-Host "🌐 Remote origin esistente: $remote" -ForegroundColor Gray
}

# 6. Push forzato sul branch main del repo di deploy
Write-Host "🚀 Pushing dei file compilati su GitHub..." -ForegroundColor Green
git push -f origin main

if ($LASTEXITCODE -ne 0) {
    Write-Warning "⚠️ Il push ha fallito. Se non hai ancora creato il repository su GitHub, crealo prima su: https://github.com/new"
} else {
    Write-Host "✅ Deploy completato con successo!" -ForegroundColor Green
}

# Torna alla cartella di lavoro principale
cd ..
