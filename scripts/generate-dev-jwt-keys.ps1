param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$keyDirectory = Join-Path $repoRoot '.local/secrets'
$privateKey = Join-Path $keyDirectory 'auth-jwt-private.pem'
$publicKey = Join-Path $keyDirectory 'auth-jwt-public.pem'

$existingKeys = @($privateKey, $publicKey) | Where-Object { Test-Path -LiteralPath $_ }
if ($existingKeys.Count -gt 0 -and -not $Force) {
    throw 'JWT key files already exist. Use -Force only when intentional token invalidation is acceptable.'
}

$openssl = Get-Command openssl -ErrorAction SilentlyContinue
if (-not $openssl) {
    throw 'OpenSSL is required to generate the local JWT key pair.'
}

New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null

& $openssl.Source genpkey -quiet -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out $privateKey
if ($LASTEXITCODE -ne 0) {
    throw 'OpenSSL failed to generate the JWT private key.'
}

& $openssl.Source pkey -in $privateKey -pubout -out $publicKey
if ($LASTEXITCODE -ne 0) {
    throw 'OpenSSL failed to derive the JWT public key.'
}

Write-Host "Generated local JWT keys under $keyDirectory. The directory is excluded from Git and Docker build contexts."
