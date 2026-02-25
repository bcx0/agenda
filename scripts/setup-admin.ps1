Param(
  [switch]$SkipMigrate,
  [switch]$SkipGenerate,
  [switch]$SkipDev
)

$ErrorActionPreference = "Stop"

Write-Host "==> Setup local admin changes" -ForegroundColor Cyan

if (-not $SkipMigrate) {
  Write-Host "==> Prisma migrate dev" -ForegroundColor Cyan
  npx prisma migrate dev --name add_availability_models
}

if (-not $SkipGenerate) {
  Write-Host "==> Prisma generate" -ForegroundColor Cyan
  npx prisma generate
}

if (-not $SkipDev) {
  Write-Host "==> npm run dev" -ForegroundColor Cyan
  npm run dev
}
