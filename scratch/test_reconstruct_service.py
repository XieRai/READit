from app.services.reconstruct_service import ReconstructService

svc = ReconstructService()
with open("assets/docs/mdpi_arc_fault_sample.pdf", "rb") as f:
    res = svc.parse_pdf(f.read())

print("=== MDPI PAPER PARSING RESULTS ===")
print("Title:", res["title"])
print("Author:", res["author"])
print("Stats:", res["stats"])
print("\n--- Page 1 Paragraphs ---")
for p in res["pages"][0]["paragraphs"]:
    idx = p["index"]
    role = p["role"]
    bbox = p["bbox"]
    preview = p["text"][:55]
    print(f"[{idx:02d}] {role.upper():<15} {bbox} -> {preview}...")

print("\n--- Page 2 Paragraphs ---")
for p in res["pages"][1]["paragraphs"]:
    idx = p["index"]
    role = p["role"]
    bbox = p["bbox"]
    preview = p["text"][:55]
    print(f"[{idx:02d}] {role.upper():<15} {bbox} -> {preview}...")
