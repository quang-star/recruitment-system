[CmdletBinding()]
param(
    [switch]$InstallAiDependencies,
    [switch]$RunComposeSmoke
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Gate {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "Gate failed: $Name (exit code $LASTEXITCODE)"
    }
}

Push-Location $repoRoot
try {
    if ($InstallAiDependencies) {
        Push-Location (Join-Path $repoRoot "ai-service")
        try {
            Invoke-Gate "Install AI test dependencies" {
                python -m pip install -c requirements.lock -e ".[test]"
            }
        }
        finally {
            Pop-Location
        }
    }

    Invoke-Gate "Architecture validation" {
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-architecture.ps1
    }

    Invoke-Gate "Contract tests" {
        python -m pytest -q -p no:cacheprovider contracts/tests
    }

    Push-Location (Join-Path $repoRoot "ai-service")
    try {
        Invoke-Gate "AI tests" {
            python -m pytest -q -p no:cacheprovider
        }
    }
    finally {
        Pop-Location
    }

    Invoke-Gate "Java tests" {
        .\auth-service\mvnw.cmd -f pom.xml test
    }

    Push-Location (Join-Path $repoRoot "web")
    try {
        Invoke-Gate "Web typecheck and production build" {
            npm.cmd run build
        }
    }
    finally {
        Pop-Location
    }

    if ($RunComposeSmoke) {
        Invoke-Gate "Docker Compose configuration" {
            docker compose -f compose.yaml -f compose.dev.yaml config --quiet
        }

        Invoke-Gate "Docker Compose smoke start" {
            docker compose -f compose.yaml -f compose.dev.yaml up -d --build
        }

        Invoke-Gate "Docker Compose service status" {
            docker compose -f compose.yaml -f compose.dev.yaml ps
        }
    }

    Write-Host "All verification gates passed." -ForegroundColor Green
}
finally {
    Pop-Location
}
