import pymupdf

doc = pymupdf.open("assets/docs/sample_academic_paper.pdf")
page = doc[0]
d = page.get_text("dict")
print(f"Page dimensions: {page.rect.width} x {page.rect.height}")
print(f"Total blocks: {len(d['blocks'])}")
for i, b in enumerate(d["blocks"]):
    if b.get("type") == 0:
        lines = b.get("lines", [])
        first_span = lines[0]["spans"][0] if lines and lines[0].get("spans") else {}
        text = " ".join(s["text"] for l in lines for s in l.get("spans", []))
        bbox = b["bbox"]
        print(f"Block {i}: bbox=({bbox[0]:.1f}, {bbox[1]:.1f}, {bbox[2]:.1f}, {bbox[3]:.1f}), font={first_span.get('font')}, size={first_span.get('size')}, text={repr(text[:65])}")
