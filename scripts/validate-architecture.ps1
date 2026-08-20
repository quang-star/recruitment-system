$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$requiredPaths = @(
    'contracts/schemas/error-response-v1.schema.json',
    'contracts/schemas/event-envelope-v1.schema.json',
    'contracts/schemas/parsed-cv-v1.schema.json',
    'contracts/schemas/parsed-jd-v1.schema.json',
    'contracts/schemas/cv-response-v1.schema.json',
    'contracts/schemas/skill-taxonomy-v1.schema.json',
    'contracts/taxonomy/it-skills-v1.seed.json',
    'gateway-service/pom.xml',
    'gateway-service/src/main/resources/application.yml',
    'auth-service/pom.xml',
    'auth-service/src/main/resources/application.properties',
    'auth-service/src/main/java/com/smartrecruitment/auth/user/infrastructure/notification/SmtpVerificationEmailSender.java',
    'core-service/pom.xml',
    'core-service/src/main/resources/application.properties',
    'ai-service/pyproject.toml',
    'ai-service/requirements.lock',
    'ai-service/alembic.ini',
    'ai-service/migrations/env.py',
    'ai-service/app/shared/security.py',
    'web/package.json',
    'web/vite.config.ts',
    'infra/postgres/init/01-create-service-databases.sh',
    'scripts/generate-dev-jwt-keys.ps1',
    'compose.yaml',
    'compose.dev.yaml'
)

$failures = [System.Collections.Generic.List[string]]::new()

foreach ($relativePath in $requiredPaths) {
    $path = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        $failures.Add("Missing required architecture artifact: $relativePath")
    }
}

Get-ChildItem -LiteralPath (Join-Path $repoRoot 'contracts') -Recurse -Filter '*.json' | ForEach-Object {
    try {
        $contract = Get-Content -LiteralPath $_.FullName -Raw -Encoding utf8 | ConvertFrom-Json
        if ($_.Name -like '*.schema.json') {
            if (-not $contract.'$schema') {
                $failures.Add("JSON schema has no `$schema: $($_.FullName)")
            }
            if (-not $contract.'$id') {
                $failures.Add("JSON schema has no `$id: $($_.FullName)")
            }
        }
    } catch {
        $failures.Add("Invalid JSON contract: $($_.FullName)")
    }
}

$domainRoots = @(
    (Join-Path $repoRoot 'auth-service/src/main/java'),
    (Join-Path $repoRoot 'core-service/src/main/java')
)
$bannedDomainImports = 'org\.springframework|org\.jooq|jakarta\.persistence|com\.fasterxml\.jackson'

foreach ($sourceRoot in $domainRoots) {
    if (-not (Test-Path -LiteralPath $sourceRoot)) { continue }
    Get-ChildItem -LiteralPath $sourceRoot -Recurse -Filter '*.java' |
        Where-Object { $_.FullName -match '[\\/]domain[\\/]' } |
        ForEach-Object {
            if (Select-String -LiteralPath $_.FullName -Pattern $bannedDomainImports -Quiet) {
                $failures.Add("Framework import found in domain: $($_.FullName)")
            }
        }

    Get-ChildItem -LiteralPath $sourceRoot -Recurse -Filter '*.java' | ForEach-Object {
        if (Select-String -LiteralPath $_.FullName -Pattern '\.infrastructure\.jooq\.generated' -Quiet) {
            if ($_.FullName -notmatch '[\\/]infrastructure[\\/]persistence[\\/]') {
                $failures.Add("Generated jOOQ type escaped persistence adapter: $($_.FullName)")
            }
        }
    }
}

$javaPoms = @(
    (Join-Path $repoRoot 'auth-service/pom.xml'),
    (Join-Path $repoRoot 'core-service/pom.xml')
)
foreach ($pom in $javaPoms) {
    if (Select-String -LiteralPath $pom -Pattern 'spring-data-jpa|hibernate-core|spring-data-jdbc' -Quiet) {
        $failures.Add("Forbidden Java persistence dependency: $pom")
    }
}

$gatewayPom = Join-Path $repoRoot 'gateway-service/pom.xml'
if (Select-String -LiteralPath $gatewayPom -Pattern 'spring-data|spring-boot-starter-(jdbc|jooq|flyway)|hibernate|postgresql' -Quiet) {
    $failures.Add("Gateway must not have a database or persistence dependency: $gatewayPom")
}

$gatewayResources = Join-Path $repoRoot 'gateway-service/src/main/resources'
Get-ChildItem -LiteralPath $gatewayResources -Recurse -File | ForEach-Object {
    if (Select-String -LiteralPath $_.FullName -Pattern 'datasource|jdbc:|auth_db|core_db|ai_db' -Quiet) {
        $failures.Add("Gateway must not contain database configuration: $($_.FullName)")
    }
}

$ownershipChecks = @(
    @{ Root = 'auth-service/src/main'; Pattern = 'core_db|ai_db'; Name = 'Auth' },
    @{ Root = 'core-service/src/main'; Pattern = 'auth_db|ai_db'; Name = 'Core' },
    @{ Root = 'ai-service/app'; Pattern = 'auth_db|core_db'; Name = 'AI' }
)
foreach ($check in $ownershipChecks) {
    $root = Join-Path $repoRoot $check.Root
    if (-not (Test-Path -LiteralPath $root)) { continue }
    Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {
        if (Select-String -LiteralPath $_.FullName -Pattern $check.Pattern -Quiet) {
            $failures.Add("$($check.Name) references a database owned by another service: $($_.FullName)")
        }
    }
}

$crossServiceChecks = @(
    @{ Root = 'auth-service/src/main/java'; Pattern = 'com\.smartrecruitment\.(core|gateway)'; Name = 'Auth' },
    @{ Root = 'core-service/src/main/java'; Pattern = 'com\.smartrecruitment\.(auth|gateway)'; Name = 'Core' },
    @{ Root = 'gateway-service/src/main/java'; Pattern = 'com\.smartrecruitment\.(auth|core)'; Name = 'Gateway' }
)
foreach ($check in $crossServiceChecks) {
    $root = Join-Path $repoRoot $check.Root
    Get-ChildItem -LiteralPath $root -Recurse -Filter '*.java' | ForEach-Object {
        if (Select-String -LiteralPath $_.FullName -Pattern $check.Pattern -Quiet) {
            $failures.Add("$($check.Name) imports code owned by another service: $($_.FullName)")
        }
    }
}

$aiAppRoot = Join-Path $repoRoot 'ai-service/app'
$bannedAiBoundaryImports = '(?m)^\s*(from|import)\s+(fastapi|sqlalchemy|pydantic|pydantic_settings)(\.|\s|$)'
Get-ChildItem -LiteralPath $aiAppRoot -Recurse -File |
    Where-Object { $_.Name -in @('domain.py', 'application.py') } |
    ForEach-Object {
    if (Select-String -LiteralPath $_.FullName -Pattern $bannedAiBoundaryImports -Quiet) {
        $failures.Add("Framework import found in AI domain/application: $($_.FullName)")
    }
}

$webSourceRoot = Join-Path $repoRoot 'web/src'
Get-ChildItem -LiteralPath $webSourceRoot -Recurse -File | ForEach-Object {
    if (Select-String -LiteralPath $_.FullName -Pattern 'https?://[^\s"'']+:(8081|8082|8083)|\b(auth-service|core-service|ai-service)\b' -Quiet) {
        $failures.Add("Web source references an internal service directly instead of the Gateway: $($_.FullName)")
    }
}

$canonicalFiles = @(
    (Join-Path $repoRoot 'ARCHITECTURE.md'),
    (Join-Path $repoRoot 'README.md'),
    (Join-Path $repoRoot 'compose.yaml')
)
foreach ($file in $canonicalFiles) {
    if (Select-String -LiteralPath $file -Pattern 'RabbitMQ' -Quiet) {
        $failures.Add("Canonical artifact still references the superseded RabbitMQ broker: $file")
    }
}

$compose = Get-Content -LiteralPath (Join-Path $repoRoot 'compose.yaml') -Raw -Encoding utf8
if ($compose -notmatch '(?m)^\s{2}kafka:\s*$') {
    $failures.Add('Compose does not define the canonical Kafka service.')
}
if ($compose -match '(?m)^\s+container_name:') {
    $failures.Add('Compose must not fix container names because that breaks project isolation and scaling.')
}
foreach ($internalPort in @('5432:5432', '9092:9092', '9000:9000', '9001:9001')) {
    if ($compose.Contains($internalPort)) {
        $failures.Add("Base Compose exposes an internal infrastructure port: $internalPort")
    }
}

$composeDev = Get-Content -LiteralPath (Join-Path $repoRoot 'compose.dev.yaml') -Raw -Encoding utf8
foreach ($developmentPort in @('5432:5432', '9092:9092', '9000:9000', '9001:9001')) {
    if (-not $composeDev.Contains($developmentPort)) {
        $failures.Add("Development Compose override is missing debug port: $developmentPort")
    }
}

$dockerIgnore = Get-Content -LiteralPath (Join-Path $repoRoot '.dockerignore') -Raw -Encoding utf8
if ($dockerIgnore -notmatch '(?m)^\.local\s*$') {
    $failures.Add('Docker build context does not exclude local generated secrets.')
}

$webDockerfile = Get-Content -LiteralPath (Join-Path $repoRoot 'web/Dockerfile') -Raw -Encoding utf8
if ($webDockerfile -notmatch '(?m)^RUN npm ci\s*$') {
    $failures.Add('Web Docker build must install the lockfile with npm ci.')
}

$aiDockerfile = Get-Content -LiteralPath (Join-Path $repoRoot 'ai-service/Dockerfile') -Raw -Encoding utf8
if ($aiDockerfile -notmatch 'requirements\.lock' -or $aiDockerfile -notmatch '--constraint requirements\.lock') {
    $failures.Add('AI Docker build must constrain runtime dependencies with requirements.lock.')
}

$jwtConsumerChecks = @(
    'gateway-service/src/main/java/com/smartrecruitment/gateway/security/GatewaySecurityConfig.java',
    'core-service/src/main/java/com/smartrecruitment/core/shared/config/CoreSecurityConfig.java'
)
foreach ($relativePath in $jwtConsumerChecks) {
    $path = Join-Path $repoRoot $relativePath
    $content = Get-Content -LiteralPath $path -Raw -Encoding utf8
    if ($content -notmatch 'AUTH_JWT_AUDIENCE' -or $content -notmatch 'audienceValidator') {
        $failures.Add("JWT consumer does not explicitly validate audience: $relativePath")
    }
}

$jwtRoleChecks = @(
    'auth-service/src/main/java/com/smartrecruitment/auth/auth/config/AuthSecurityConfig.java',
    'gateway-service/src/main/java/com/smartrecruitment/gateway/security/GatewaySecurityConfig.java',
    'core-service/src/main/java/com/smartrecruitment/core/shared/config/CoreSecurityConfig.java'
)
foreach ($relativePath in $jwtRoleChecks) {
    $path = Join-Path $repoRoot $relativePath
    $content = Get-Content -LiteralPath $path -Raw -Encoding utf8
    if ($content -notmatch 'setAuthoritiesClaimName\("roles"\)' -or $content -notmatch 'setAuthorityPrefix\("ROLE_"\)') {
        $failures.Add("JWT roles claim is not mapped to Spring Security authorities: $relativePath")
    }
}

$aiSecurity = Get-Content -LiteralPath (Join-Path $repoRoot 'ai-service/app/shared/security.py') -Raw -Encoding utf8
if ($aiSecurity -notmatch 'audience=' -or $aiSecurity -notmatch 'issuer=' -or $aiSecurity -notmatch 'algorithms=') {
    $failures.Add('AI JWT verification must explicitly validate algorithm, issuer and audience.')
}

$authProperties = Get-Content -LiteralPath (Join-Path $repoRoot 'auth-service/src/main/resources/application.properties') -Raw -Encoding utf8
if ($authProperties -notmatch 'AUTH_JWT_PRIVATE_KEY_PATH' -or $authProperties -notmatch 'AUTH_JWT_PUBLIC_KEY_PATH') {
    $failures.Add('Auth signing keys must be supplied as persistent mounted files.')
}
if ($authProperties -notmatch 'AUTH_SMTP_HOST' -or $authProperties -notmatch 'AUTH_EMAIL_VERIFICATION_BASE_URL') {
    $failures.Add('Auth email verification delivery is not externally configurable.')
}

if ($compose -notmatch '(?m)^\s{2}mailpit:\s*$') {
    $failures.Add('Compose does not define the local email capture service.')
}
if ($composeDev -notmatch '8025:8025') {
    $failures.Add('Development Compose does not expose the Mailpit inbox UI.')
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host 'Architecture validation passed: contracts, broker choice, service boundaries, framework isolation, JWT consumer configuration and DB ownership.'
