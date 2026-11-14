import pytest

from app.jd.parser import _family
from app.matching.algorithm import _role_family
from app.taxonomy.roles import role_family


@pytest.mark.parametrize("title,family", [
    ("Senior Backend Engineer", "BACKEND"),
    ("Back-end Developer", "BACKEND"),
    ("Back end Developer", "BACKEND"),
    ("backend-developer", "BACKEND"),
    ("Full-stack Developer", "FULLSTACK"),
    ("Fullstack Backend Engineer", "FULLSTACK"),
    ("Front End Engineer", "FRONTEND"),
    ("iOS Developer", "MOBILE"),
    ("DevOps Engineer", "DEVOPS"),
    ("Machine Learning Engineer", "DATA_AI"),
    ("AI Engineer", "DATA_AI"),
    ("Data Engineer", "DATA_AI"),
    ("Security Engineer", "SECURITY"),
    ("Tester", "QA"),
    ("Quality Assurance Engineer", "QA"),
    ("Database Administrator", "OTHER"),
    ("Project Manager", "OTHER"),
    ("Kế toán", "OTHER"),
    ("", "OTHER"),
    (None, "OTHER"),
])
def test_role_family_classifies_common_title_spellings(title, family):
    assert role_family(title) == family


@pytest.mark.parametrize("title", [
    "Back-end Developer", "Full-stack Developer", "Machine Learning Engineer",
    "Quality Assurance Engineer", "Database Administrator", "Mobile Developer",
])
def test_cv_and_jd_use_the_same_role_family(title):
    assert _family(title) == _role_family({"titleRaw": title})
