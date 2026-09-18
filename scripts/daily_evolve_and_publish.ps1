# Daily cycle: evolve -> snapshot DB into the dashboard -> push to GitHub -> deploy to Vercel.
# Used by the "AlphaEvolve TSLA Daily Evolution" scheduled task.

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location $projectDir

# 1. Run the evolution engine
python run_daily.py --generations 3
if ($LASTEXITCODE -ne 0) { throw "run_daily.py failed with exit code $LASTEXITCODE" }

# 2. Refresh the DB snapshot the deployed dashboard reads
Copy-Item "$projectDir\db\evolution.db" "$projectDir\dashboard\db\evolution.db" -Force

# 3. Commit + push (keeps the GitHub repo current; skip silently if nothing changed)
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    $today = Get-Date -Format "yyyy-MM-dd"
    git commit -m "Daily evolution $today"
    git push origin main
}

# 4. Redeploy the dashboard to Vercel production
Set-Location "$projectDir\dashboard"
vercel deploy --prod --yes
