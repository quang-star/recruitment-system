from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
from time import monotonic


class OcrUnavailableError(RuntimeError):
    """Raised when the runtime image does not provide the OCR executables."""


class OcrProcessingError(RuntimeError):
    """Raised for a bounded OCR conversion/recognition failure."""


def extract_pdf_text(content: bytes, page_count: int, max_pages: int = 5,
                     timeout_seconds: float = 60.0) -> str:
    pdftoppm = shutil.which("pdftoppm")
    tesseract = shutil.which("tesseract")
    if pdftoppm is None or tesseract is None:
        raise OcrUnavailableError("OCR runtime dependencies are unavailable")

    pages_to_process = min(max(1, page_count), max_pages)
    deadline = monotonic() + timeout_seconds
    environment = {**os.environ, "OMP_THREAD_LIMIT": "1"}

    try:
        with TemporaryDirectory(prefix="cv-ocr-") as directory:
            working = Path(directory)
            source = working / "source.pdf"
            source.write_bytes(content)
            rendered_prefix = working / "page"
            conversion = subprocess.run(
                [
                    pdftoppm,
                    "-f", "1",
                    "-l", str(pages_to_process),
                    "-r", "220",
                    "-scale-to", "3000",
                    "-png",
                    str(source),
                    str(rendered_prefix),
                ],
                check=False,
                capture_output=True,
                timeout=_remaining(deadline),
                env=environment,
            )
            if conversion.returncode != 0:
                raise OcrProcessingError("PDF rasterization failed")

            images = sorted(working.glob("page-*.png"), key=_page_number)
            if not images:
                raise OcrProcessingError("PDF rasterization produced no pages")

            recognized_pages: list[str] = []
            for image in images[:pages_to_process]:
                recognition = subprocess.run(
                    [
                        tesseract,
                        str(image),
                        "stdout",
                        "--dpi", "220",
                        "-l", "vie+eng",
                        "--psm", "3",
                    ],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=_remaining(deadline),
                    env=environment,
                )
                if recognition.returncode != 0:
                    raise OcrProcessingError("Tesseract recognition failed")
                recognized_pages.append(recognition.stdout.strip())
            return "\n".join(value for value in recognized_pages if value)[:200_000].strip()
    except subprocess.TimeoutExpired as exception:
        raise OcrProcessingError("OCR processing timed out") from exception


def _remaining(deadline: float) -> float:
    remaining = deadline - monotonic()
    if remaining <= 0:
        raise OcrProcessingError("OCR processing timed out")
    return remaining


def _page_number(path: Path) -> int:
    try:
        return int(path.stem.rsplit("-", 1)[1])
    except (IndexError, ValueError):
        return 0
