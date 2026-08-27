from app.taxonomy.normalizer import extract_known_skills, normalize_skill, taxonomy_version


def test_aliases_resolve_to_stable_canonical_ids() -> None:
    react = normalize_skill("ReactJS")
    postgres = normalize_skill("postgres")

    assert react is not None
    assert react.canonical_name == "React"
    assert react.stable_id == "d4f49f3b-a28e-5fd3-b558-94beba4054c0"
    assert postgres is not None
    assert postgres.canonical_name == "PostgreSQL"
    assert taxonomy_version() == "1.0.0"


def test_longest_alias_wins_without_duplicate_canonical_skill() -> None:
    skills = extract_known_skills("Apache Kafka, Kafka, SpringBoot and an InternalPlatformX")

    assert [(skill.canonical_name, skill.raw) for skill in skills] == [
        ("Apache Kafka", "Apache Kafka"),
        ("Spring Boot", "SpringBoot"),
    ]
    assert normalize_skill("InternalPlatformX") is None
