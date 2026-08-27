from __future__ import annotations

import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from jsonschema import Draft202012Validator, FormatChecker
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject, NumberObject

from app.cv.parser import parse_pdf


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build an image-only PDF fixture and prove the container OCR path end to end.",
    )
    parser.add_argument("--source", type=Path, required=True,
                        help="Small non-sensitive text PDF used to create the scanned fixture")
    parser.add_argument("--expect-skill", action="append", default=[],
                        help="Skill name that must be recovered; may be repeated")
    arguments = parser.parse_args()

    scanned = _image_only_pdf(arguments.source.read_bytes())
    embedded_text = "\n".join(
        (page.extract_text() or "") for page in PdfReader(BytesIO(scanned)).pages
    ).strip()
    if embedded_text:
        raise RuntimeError("Generated OCR fixture unexpectedly contains an embedded text layer")

    digest = sha256(scanned).hexdigest()
    payload = parse_pdf("779494ac-c858-4570-a884-6e88423b8e2b", digest, scanned)
    schema_path = Path("/app/contracts/schemas/parsed-cv-v1.schema.json")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(payload)

    recovered = {str(skill["raw"]) for skill in payload["skills"]}
    missing = set(arguments.expect_skill) - recovered
    if missing:
        raise RuntimeError(
            f"OCR did not recover expected skills: {', '.join(sorted(missing))}; "
            f"recovered canonical skills: {', '.join(sorted(recovered)) or 'none'}"
        )
    if payload["document"]["textExtractionMethod"] != "OCR":
        raise RuntimeError("Parser did not record OCR as the text extraction method")

    print(json.dumps({
        "fixture": "synthetic-image-only-pdf",
        "embeddedTextCharacters": 0,
        "textExtractionMethod": payload["document"]["textExtractionMethod"],
        "parserVersion": payload["document"]["parserVersion"],
        "recoveredSkills": sorted(recovered),
        "overallConfidence": payload["summary"]["overallConfidence"],
        "qualityFlags": payload["summary"]["qualityFlags"],
        "schemaValidated": True,
    }, indent=2, sort_keys=True))


def _image_only_pdf(source: bytes) -> bytes:
    with TemporaryDirectory(prefix="ocr-smoke-") as directory:
        working = Path(directory)
        source_path = working / "source.pdf"
        prefix = working / "scan"
        source_path.write_bytes(source)
        rendered = subprocess.run(
            [
                "pdftoppm", "-f", "1", "-l", "1", "-singlefile",
                "-r", "220", "-scale-to", "3000", str(source_path), str(prefix),
            ],
            check=False,
            capture_output=True,
            timeout=30,
        )
        if rendered.returncode != 0:
            raise RuntimeError("Could not rasterize the OCR smoke fixture")
        width, height, pixels = _read_ppm(prefix.with_suffix(".ppm"))

    writer = PdfWriter()
    page_width, page_height = 595, 842
    page = writer.add_blank_page(width=page_width, height=page_height)
    image = DecodedStreamObject()
    image.set_data(pixels)
    image.update({
        NameObject("/Type"): NameObject("/XObject"),
        NameObject("/Subtype"): NameObject("/Image"),
        NameObject("/Width"): NumberObject(width),
        NameObject("/Height"): NumberObject(height),
        NameObject("/ColorSpace"): NameObject("/DeviceRGB"),
        NameObject("/BitsPerComponent"): NumberObject(8),
    })
    image_reference = writer._add_object(image.flate_encode())
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/XObject"): DictionaryObject({NameObject("/Scan"): image_reference}),
    })
    content = DecodedStreamObject()
    content.set_data(f"q {page_width} 0 0 {page_height} 0 0 cm /Scan Do Q\n".encode("ascii"))
    page[NameObject("/Contents")] = writer._add_object(content)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def _read_ppm(path: Path) -> tuple[int, int, bytes]:
    with path.open("rb") as source:
        if source.readline().strip() != b"P6":
            raise RuntimeError("Unexpected raster format")
        line = source.readline()
        while line.startswith(b"#"):
            line = source.readline()
        width, height = (int(value) for value in line.split())
        if source.readline().strip() != b"255":
            raise RuntimeError("Unsupported PPM color depth")
        pixels = source.read()
    if len(pixels) != width * height * 3:
        raise RuntimeError("Incomplete raster data")
    return width, height, pixels


if __name__ == "__main__":
    main()
