"""Regenerate the synthetic E2E PDF using the AI service's pypdf dependency."""
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject


root = Path(__file__).parent
writer = PdfWriter()
writer.append(PdfReader(root / "minimal-cv.pdf"))
page = writer.pages[0]
lines = ["Experience", "Backend Engineer", "Build Java services and Kafka integrations with the team.",
         "Skills: Java, Kafka, NewFrameworkX"]
commands = "BT /F1 12 Tf 72 680 Td 16 TL " + " T* ".join(f"({line}) Tj" for line in lines) + " ET"
stream = DecodedStreamObject()
stream.set_data(page.get_contents().get_data() + b"\n" + commands.encode("ascii"))
page.replace_contents(stream)
writer.write(root / "job-scoped-skills-cv.pdf")
