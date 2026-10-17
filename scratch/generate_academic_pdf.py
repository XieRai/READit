import pymupdf
from pathlib import Path

def generate_paper():
    scratch_dir = Path("scratch")
    scratch_dir.mkdir(exist_ok=True)
    pdf_path = scratch_dir / "sample_academic_paper.pdf"

    doc = pymupdf.open()

    # Page 1: Standard A4 (595 x 842 points)
    page1 = doc.new_page(width=595, height=842)

    # Document Header / Spanning Top Section
    page1.insert_text(
        (50, 70),
        "Cognitive Load Reduction in Academic Reading",
        fontsize=16,
        fontname="helv",
    )
    page1.insert_text(
        (50, 95),
        "Authors: Dr. Elena Rostova, Prof. Marcus Chen",
        fontsize=10,
        fontname="helv",
    )
    page1.insert_textbox(
        pymupdf.Rect(50, 115, 545, 175),
        "Abstract—The split-attention effect has been widely recognized as a primary cognitive bottleneck when graduate students engage with dense mathematical literature. In this paper, an in-situ reading environment is introduced to eliminate context-switching penalties. Empirical evaluations demonstrate a 42% acceleration in comprehension speed.",
        fontsize=9,
        fontname="times-italic",
    )

    # Column 1 (Left: x in 50..280)
    col1_rect = pymupdf.Rect(50, 190, 280, 780)
    col1_text = (
        "1. Introduction\n\n"
        "Traditional digital reading environments were developed under the document-centric paradigm of physical paper reproduction.\n\n"
        "Consequently, supplementary derivations are relegated to footnotes, sidebars, or external browser tabs.\n\n"
        "When complex scientific papers are investigated, working memory is rapidly saturated by the necessity of holding antecedent propositions in mind.\n\n"
        "As demonstrated by Chen et al. (2024), cognitive friction is significantly heightened whenever multi-column layouts force erratic saccadic movements.\n\n"
        "To mitigate this issue, structured sentence decomposition is urgently required."
    )
    page1.insert_textbox(col1_rect, col1_text, fontsize=9, fontname="times-roman")

    # Column 2 (Right: x in 315..545)
    col2_rect = pymupdf.Rect(315, 190, 545, 780)
    col2_text = (
        "2. Methodological Formulation\n\n"
        "To attenuate these cognitive obstacles, our system incorporates deep linguistic parsing.\n\n"
        "Passive voice constructions are systematically identified by dependency grammar analyzers.\n\n"
        "Subsequently, conceptual intuition lenses are generated on demand using large language model synthesis.\n\n"
        "Empirical benchmarks indicate that extraneous cognitive load is attenuated by 38% across diverse reader cohorts.\n\n"
        "Furthermore, orthogonal semantic pathways facilitate deeper structural synthesis."
    )
    page1.insert_textbox(col2_rect, col2_text, fontsize=9, fontname="times-roman")

    # Page 2
    page2 = doc.new_page(width=595, height=842)
    page2.insert_text((50, 70), "3. Experimental Results", fontsize=12, fontname="helv")
    page2.insert_textbox(
        pymupdf.Rect(50, 90, 545, 300),
        "The proposed methodology was evaluated across forty-eight peer-reviewed publications.\n\n"
        "Significant improvements were observed in both subjective reader confidence and retention metrics.\n\n"
        "Furthermore, mathematical derivations were deconstructed with minimal disruption to the primary text flow.\n\n"
        "In conclusion, cognitive load reduction is effectively realized through in-situ computational scaffolding.",
        fontsize=9,
        fontname="times-roman",
    )

    # Set PDF Metadata
    doc.set_metadata({
        "title": "Cognitive Load Reduction in Academic Reading",
        "author": "Dr. Elena Rostova, Prof. Marcus Chen",
        "subject": "Cognitive Load Theory and Academic Reading Environments",
        "keywords": "cognitive load, split-attention effect, academic reading, in-situ scaffolding"
    })

    doc.save(str(pdf_path))
    doc.close()
    print(f"Generated clean academic test PDF at: {pdf_path}")

if __name__ == "__main__":
    generate_paper()
