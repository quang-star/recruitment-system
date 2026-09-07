[CmdletBinding()]
param(
    [string]$GatewayUrl = 'http://localhost:8080',
    [string]$WebUrl = 'http://localhost:5173',
    [string]$CandidateEmail = $env:SMOKE_CANDIDATE_EMAIL,
    [string]$CandidatePassword = $env:SMOKE_CANDIDATE_PASSWORD,
    [int]$MaxAttempts = 30
)

$ErrorActionPreference = 'Stop'

function Wait-JsonEndpoint {
    param([string]$Uri)
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            return Invoke-RestMethod -Method Get -Uri $Uri -TimeoutSec 5
        } catch {
            if ($attempt -eq $MaxAttempts) { throw }
            Start-Sleep -Seconds 2
        }
    }
}

$health = Wait-JsonEndpoint "$GatewayUrl/actuator/health"
if ($health.status -ne 'UP') { throw "Gateway health is not UP." }

$jwks = Wait-JsonEndpoint "$GatewayUrl/.well-known/jwks.json"
if (-not $jwks.keys -or $jwks.keys.Count -lt 1) { throw 'JWKS endpoint returned no signing key.' }

$web = Invoke-WebRequest -Method Get -Uri $WebUrl -TimeoutSec 10
if ($web.StatusCode -ne 200 -or $web.Content -notmatch '<div id="root">') {
    throw 'Web entry point is unavailable or malformed.'
}

if ([string]::IsNullOrWhiteSpace($CandidateEmail) -or [string]::IsNullOrWhiteSpace($CandidatePassword)) {
    Write-Host 'Public health/JWKS/Web smoke passed. Set SMOKE_CANDIDATE_EMAIL and SMOKE_CANDIDATE_PASSWORD to include login and Job listing.'
    exit 0
}

$loginBody = @{
    email = $CandidateEmail
    password = $CandidatePassword
    clientType = 'WEB'
    deviceName = 'Smoke script'
} | ConvertTo-Json
$session = Invoke-RestMethod -Method Post -Uri "$GatewayUrl/api/v1/auth/login" -ContentType 'application/json' -Body $loginBody -TimeoutSec 10
if ([string]::IsNullOrWhiteSpace($session.accessToken)) { throw 'Login returned no access token.' }

$headers = @{
    Authorization = "Bearer $($session.accessToken)"
    'X-Correlation-Id' = [guid]::NewGuid().ToString()
}
$me = Invoke-RestMethod -Method Get -Uri "$GatewayUrl/api/v1/auth/me" -Headers $headers -TimeoutSec 10
if ($me.userId -ne $session.userId -or -not ($me.roles -contains 'CANDIDATE')) {
    throw 'Smoke credentials must belong to an active CANDIDATE account.'
}

$jobs = Invoke-RestMethod -Method Get -Uri "$GatewayUrl/api/v1/candidate/jobs" -Headers $headers -TimeoutSec 10
Write-Host "Authenticated smoke passed for user $($me.userId); published Job count: $($jobs.Count)."
