from app.services.ai_reconstruct_service import AiReconstructService

svc = AiReconstructService()
with open("assets/docs/mdpi_arc_fault_sample.pdf", "rb") as f:
    res = svc.parse_pdf_ai(f.read(), max_pages=1)

print("Success:", res["success"])
print("Engine:", res["engine"])
print("Title:", res["title"])
print("Stats:", res["stats"])
print("\nExtracted Paragraphs on Page 1:")
for p in res["pages"][0]["paragraphs"]:
    sec = p.get("section_title") or "Top"
    sub = p.get("subchapter_title") or "None"
    idx = p["index"]
    role = p["role"]
    sents = len(p["sentences"])
    txt = p["text"][:60]
    bbox = p["bbox"]
    print(f"[{idx:02d}] {role.upper():<14} | Section: {sec[:15]:<15} | Sub: {sub[:20]:<20} | Sents: {sents} | BBox: {bbox}")
    print(f"     \"{txt}...\"\n")
