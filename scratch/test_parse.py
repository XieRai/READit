from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

with open("scratch/sample_academic_paper.pdf", "rb") as f:
    pdf_bytes = f.read()

res = client.post("/api/documents/parse", files={"file": ("sample_academic_paper.pdf", pdf_bytes, "application/pdf")})

print(f"Status code: {res.status_code}")
assert res.status_code == 200

data = res.json()
print(f"Title: {data.get('title')}")
print(f"Author: {data.get('author')}")
print(f"File Hash (SHA-256): {data.get('file_hash')}")
print(f"Page Count: {data.get('page_count')}")
print(f"Sentence Count: {data.get('sentence_count')}")
print("\n--- All Extracted Sentences ---")
for idx, s in enumerate(data.get("sentences", []), start=1):
    actor_str = s.get("actor") or "None"
    print(f"[{idx:02d}] {s.get('badge')} | Actor: {actor_str} | Terms: {s.get('keywords')}")
    print(f"     Orig: {s.get('orig')}")
    print(f"     EN:   {s.get('en')}")
    print(f"     ID:   {s.get('id')}\n")

print("SUCCESS: PyMuPDF + spaCy pipeline operational!")
