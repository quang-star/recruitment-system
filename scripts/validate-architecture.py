#!/usr/bin/env python3
"""Cross-platform architecture guardrails for the repository."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
FAILURES: list[str] = []
TEXT_SUFFIXES = {
    ".ini",
    ".java",
    ".js",
    ".json",
    ".md",
    ".properties",
    ".py",
    ".sql",
    ".toml",
    ".ts",
    ".tsx",
    ".xml",
    ".yaml",
    ".yml",
}


def project_path(relative_path: str) -> Path:
    return REPO_ROOT / relative_path


def read(relative_path: str) -> str:
    return project_path(relative_path).read_text(encoding="utf-8")


def source_files(relative_root: str, pattern: str = "*") -> list[Path]:
    root = project_path(relative_root)
    return list(root.rglob(pattern)) if root.exists() else []


def is_text_source(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in TEXT_SUFFIXES


def require_artifacts() -> None:
    required_paths = (
        "contracts/schemas/error-response-v1.schema.json",
        "contracts/schemas/event-envelope-v1.schema.json",
        "contracts/schemas/parsed-cv-v1.schema.json",
        "contracts/schemas/parsed-jd-v1.schema.json",
        "contracts/schemas/cv-response-v1.schema.json",
        "contracts/schemas/skill-taxonomy-v1.schema.json",
        "contracts/taxonomy/it-skills-v1.seed.json",
        "gateway-service/pom.xml",
        "gateway-service/src/main/resources/application.yml",
        "auth-service/pom.xml",
        "auth-service/src/main/resources/application.properties",
        "auth-service/src/main/java/com/smartrecruitment/auth/user/infrastructure/notification/SmtpVerificationEmailSender.java",
        "core-service/pom.xml",
        "core-service/src/main/resources/application.properties",
        "ai-service/pyproject.toml",
        "ai-service/requirements.lock",
        "ai-service/alembic.ini",
        "ai-service/migrations/env.py",
        "ai-service/app/shared/security.py",
        "web/package.json",
        "web/vite.config.ts",
        "infra/postgres/init/01-create-service-databases.sh",
        "scripts/generate-dev-jwt-keys.ps1",
        "scripts/generate-dev-jwt-keys.sh",
        "compose.yaml",
        "compose.dev.yaml",
    )
    for relative_path in required_paths:
        if not project_path(relative_path).is_file():
            FAILURES.append(f"Missing required architecture artifact: {relative_path}")


def validate_contract_json() -> None:
    for path in source_files("contracts", "*.json"):
        try:
            contract = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            FAILURES.append(f"Invalid JSON contract: {path}")
            continue
        if path.name.endswith(".schema.json"):
            if not contract.get("$schema"):
                FAILURES.append(f"JSON schema has no $schema: {path}")
            if not contract.get("$id"):
                FAILURES.append(f"JSON schema has no $id: {path}")


def validate_java_boundaries() -> None:
    banned_domain_imports = re.compile(
        r"org\.springframework|org\.jooq|jakarta\.persistence|com\.fasterxml\.jackson"
    )
    generated_type = re.compile(r"\.infrastructure\.jooq\.generated")
    for relative_root in (
        "auth-service/src/main/java",
        "core-service/src/main/java",
    ):
        for path in source_files(relative_root, "*.java"):
            content = path.read_text(encoding="utf-8")
            if "domain" in path.parts and banned_domain_imports.search(content):
                FAILURES.append(f"Framework import found in domain: {path}")
            if generated_type.search(content):
                normalized = path.as_posix()
                if "/infrastructure/persistence/" not in normalized:
                    FAILURES.append(f"Generated jOOQ type escaped persistence adapter: {path}")

    forbidden_persistence = re.compile(
        r"spring-data-jpa|hibernate-core|spring-data-jdbc"
    )
    for relative_path in ("auth-service/pom.xml", "core-service/pom.xml"):
        if forbidden_persistence.search(read(relative_path)):
            FAILURES.append(
                f"Forbidden Java persistence dependency: {project_path(relative_path)}"
            )

    gateway_pom = read("gateway-service/pom.xml")
    if re.search(
        r"spring-data|spring-boot-starter-(?:jdbc|jooq|flyway)|hibernate|postgresql",
        gateway_pom,
    ):
        FAILURES.append(
            "Gateway must not have a database or persistence dependency: "
            f"{project_path('gateway-service/pom.xml')}"
        )
    for path in source_files("gateway-service/src/main/resources"):
        if is_text_source(path) and re.search(
            r"datasource|jdbc:|auth_db|core_db|ai_db",
            path.read_text(encoding="utf-8"),
        ):
            FAILURES.append(f"Gateway must not contain database configuration: {path}")

    ownership_checks = (
        ("auth-service/src/main", r"core_db|ai_db", "Auth"),
        ("core-service/src/main", r"auth_db|ai_db", "Core"),
        ("ai-service/app", r"auth_db|core_db", "AI"),
    )
    for relative_root, pattern, service_name in ownership_checks:
        expression = re.compile(pattern)
        for path in source_files(relative_root):
            if is_text_source(path) and expression.search(path.read_text(encoding="utf-8")):
                FAILURES.append(
                    f"{service_name} references a database owned by another service: {path}"
                )

    cross_service_checks = (
        ("auth-service/src/main/java", r"com\.smartrecruitment\.(?:core|gateway)", "Auth"),
        ("core-service/src/main/java", r"com\.smartrecruitment\.(?:auth|gateway)", "Core"),
        ("gateway-service/src/main/java", r"com\.smartrecruitment\.(?:auth|core)", "Gateway"),
    )
    for relative_root, pattern, service_name in cross_service_checks:
        expression = re.compile(pattern)
        for path in source_files(relative_root, "*.java"):
            if expression.search(path.read_text(encoding="utf-8")):
                FAILURES.append(
                    f"{service_name} imports code owned by another service: {path}"
                )


def validate_ai_and_web_boundaries() -> None:
    banned_ai_imports = re.compile(
        r"^\s*(?:from|import)\s+(?:fastapi|sqlalchemy|pydantic|pydantic_settings)(?:\.|\s|$)",
        re.MULTILINE,
    )
    for path in source_files("ai-service/app"):
        if is_text_source(path) and path.name in {"domain.py", "application.py"}:
            if banned_ai_imports.search(path.read_text(encoding="utf-8")):
                FAILURES.append(f"Framework import found in AI domain/application: {path}")

    internal_service = re.compile(
        r"https?://[^\s\"']+:(?:8081|8082|8083)|\b(?:auth-service|core-service|ai-service)\b"
    )
    for path in source_files("web/src"):
        if is_text_source(path) and internal_service.search(path.read_text(encoding="utf-8")):
            FAILURES.append(
                f"Web source references an internal service directly instead of the Gateway: {path}"
            )


def validate_runtime_configuration() -> None:
    for relative_path in ("ARCHITECTURE.md", "README.md", "compose.yaml"):
        if "RabbitMQ" in read(relative_path):
            FAILURES.append(
                "Canonical artifact still references the superseded RabbitMQ broker: "
                f"{project_path(relative_path)}"
            )

    compose = read("compose.yaml")
    compose_dev = read("compose.dev.yaml")
    if not re.search(r"^  kafka:\s*$", compose, re.MULTILINE):
        FAILURES.append("Compose does not define the canonical Kafka service.")
    if re.search(r"^\s+container_name:", compose, re.MULTILINE):
        FAILURES.append(
            "Compose must not fix container names because that breaks project isolation and scaling."
        )
    for internal_port in ("5432:5432", "9092:9092", "9000:9000", "9001:9001"):
        if internal_port in compose:
            FAILURES.append(
                f"Base Compose exposes an internal infrastructure port: {internal_port}"
            )
    for development_port in ("5432:5432", "9092:9092", "9000:9000", "9001:9001"):
        if development_port not in compose_dev:
            FAILURES.append(
                f"Development Compose override is missing debug port: {development_port}"
            )

    if not re.search(r"^\.local\s*$", read(".dockerignore"), re.MULTILINE):
        FAILURES.append("Docker build context does not exclude local generated secrets.")
    if not re.search(r"^RUN npm ci\s*$", read("web/Dockerfile"), re.MULTILINE):
        FAILURES.append("Web Docker build must install the lockfile with npm ci.")
    ai_dockerfile = read("ai-service/Dockerfile")
    if "requirements.lock" not in ai_dockerfile or "--constraint requirements.lock" not in ai_dockerfile:
        FAILURES.append(
            "AI Docker build must constrain runtime dependencies with requirements.lock."
        )


def validate_security_configuration() -> None:
    for relative_path in (
        "gateway-service/src/main/java/com/smartrecruitment/gateway/security/GatewaySecurityConfig.java",
        "core-service/src/main/java/com/smartrecruitment/core/shared/config/CoreSecurityConfig.java",
    ):
        content = read(relative_path)
        if "AUTH_JWT_AUDIENCE" not in content or "audienceValidator" not in content:
            FAILURES.append(
                f"JWT consumer does not explicitly validate audience: {relative_path}"
            )

    for relative_path in (
        "auth-service/src/main/java/com/smartrecruitment/auth/auth/config/AuthSecurityConfig.java",
        "gateway-service/src/main/java/com/smartrecruitment/gateway/security/GatewaySecurityConfig.java",
        "core-service/src/main/java/com/smartrecruitment/core/shared/config/CoreSecurityConfig.java",
    ):
        content = read(relative_path)
        if (
            'setAuthoritiesClaimName("roles")' not in content
            or 'setAuthorityPrefix("ROLE_")' not in content
        ):
            FAILURES.append(
                f"JWT roles claim is not mapped to Spring Security authorities: {relative_path}"
            )

    ai_security = read("ai-service/app/shared/security.py")
    if not all(fragment in ai_security for fragment in ("audience=", "issuer=", "algorithms=")):
        FAILURES.append(
            "AI JWT verification must explicitly validate algorithm, issuer and audience."
        )

    auth_properties = read("auth-service/src/main/resources/application.properties")
    if not all(
        fragment in auth_properties
        for fragment in ("AUTH_JWT_PRIVATE_KEY_PATH", "AUTH_JWT_PUBLIC_KEY_PATH")
    ):
        FAILURES.append("Auth signing keys must be supplied as persistent mounted files.")
    if not all(
        fragment in auth_properties
        for fragment in ("AUTH_SMTP_HOST", "AUTH_EMAIL_VERIFICATION_BASE_URL")
    ):
        FAILURES.append("Auth email verification delivery is not externally configurable.")

    compose = read("compose.yaml")
    compose_dev = read("compose.dev.yaml")
    if not re.search(r"^  mailpit:\s*$", compose, re.MULTILINE):
        FAILURES.append("Compose does not define the local email capture service.")
    if "8025:8025" not in compose_dev:
        FAILURES.append("Development Compose does not expose the Mailpit inbox UI.")


def main() -> int:
    require_artifacts()
    validate_contract_json()
    validate_java_boundaries()
    validate_ai_and_web_boundaries()
    validate_runtime_configuration()
    validate_security_configuration()
    if FAILURES:
        for failure in FAILURES:
            print(f"ERROR: {failure}", file=sys.stderr)
        return 1
    print(
        "Architecture validation passed: contracts, broker choice, service boundaries, "
        "framework isolation, JWT consumer configuration and DB ownership."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
