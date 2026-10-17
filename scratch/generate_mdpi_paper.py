"""
Generate realistic MDPI-style academic PDF with left-sidebar citation and multi-section text
matching the user's prompt (Energies 2024, 17, 4675).
"""

from pathlib import Path
import pymupdf

def create_mdpi_sample():
    doc = pymupdf.open()

    # Page 1: A4 (595 x 842 pt)
    page1 = doc.new_page(width=595, height=842)

    # Top Running Header
    page1.insert_text((50, 40), "energies", fontsize=16, fontname="helv", color=(0.8, 0.4, 0.0))
    page1.insert_text((510, 40), "MDPI", fontsize=11, fontname="helv", color=(0.2, 0.2, 0.2))

    # Article badge
    page1.insert_text((180, 75), "Article", fontsize=8.5, fontname="helv", color=(0.5, 0.5, 0.5))

    # Main Paper Title (Starts at x=180)
    title_rect = pymupdf.Rect(180, 85, 545, 145)
    page1.insert_textbox(
        title_rect,
        "Intelligent Identification Method of Low Voltage AC Series Arc Fault Based on Using Residual Model and Rime Optimization Algorithm",
        fontsize=13,
        fontname="helv",
    )

    # Authors
    page1.insert_text((180, 160), "Xiao He, Takahiro Kawaguchi and Seiji Hashimoto *", fontsize=9.5, fontname="helv")

    # Affiliations
    affil_rect = pymupdf.Rect(180, 178, 545, 225)
    page1.insert_textbox(
        affil_rect,
        "Division of Electronics and Informatics, School of Science and Technology, Gunma University, Kiryu 376-8515, Japan\n* Correspondence: hashimotos@gunma-u.ac.jp",
        fontsize=7.5,
        fontname="times-roman",
    )

    # Left Sidebar Metadata (x=45..160, y=75..360)
    sidebar_rect = pymupdf.Rect(45, 75, 160, 360)
    sidebar_text = (
        "Citation: He, X.; Kawaguchi, T.; Hashimoto, S. Intelligent Identification Method of Low Voltage AC Series Arc Fault.\n\n"
        "Academic Editor: Igor Timoshkin\n\n"
        "Received: 5 August 2024\n"
        "Revised: 7 September 2024\n"
        "Accepted: 17 September 2024\n"
        "Published: 20 September 2024\n\n"
        "Copyright: © 2024 by authors.\n"
        "Licensee MDPI, Basel, Switzerland."
    )
    page1.insert_textbox(sidebar_rect, sidebar_text, fontsize=6.8, fontname="times-roman")

    # Abstract (x=180..545, y=235..370)
    abstract_rect = pymupdf.Rect(180, 235, 545, 370)
    abstract_text = (
        "Abstract: Aiming at the problem of accurate AC series arc fault detection, this paper proposes a low voltage AC series arc fault intelligent detection model based on deep learning. According to the GB/T 31143-2014 standard, an experimental platform was established. This system comprises a lower computer and an upper computer. Based on a one-dimensional Convolutional Neural Network (CNN), Residual model (Res) and RIME optimization algorithm are introduced to optimize the CNN. Experimental results indicate that the RIME optimization algorithm delivers the best performance when optimizing a one-dimensional CNN with introduced Res, achieving 99.42% accuracy."
    )
    page1.insert_textbox(abstract_rect, abstract_text, fontsize=8, fontname="times-roman")

    # Keywords (x=180..545, y=380..405)
    page1.insert_text(
        (180, 390),
        "Keywords: series arc fault; Convolutional Neural Network (CNN); Residual model (Res); RIME",
        fontsize=8,
        fontname="times-roman"
    )

    # Section 1. Introduction (x=180..545, y=420..)
    page1.insert_text((180, 425), "1. Introduction", fontsize=9.5, fontname="helv")

    intro_rect = pymupdf.Rect(180, 435, 545, 550)
    intro_text = (
        "Due to the impact of different circuit and load types, the current magnitude associated with arc faults varies. Series arc faults, in particular, generate lower currents compared to parallel and ground arc faults, making them more difficult for circuit breakers to detect. This challenge in detection can prevent timely circuit disconnection, increasing the risk of electrical fires. Therefore, effective intelligent detection of AC series arc faults under various operating conditions is critical for reducing the likelihood of electrical fires. Currently, arc fault detection methods are categorized into three main types."
    )
    page1.insert_textbox(intro_rect, intro_text, fontsize=8.2, fontname="times-roman")

    # Subsection 1.1 (x=180..545)
    page1.insert_text((180, 565), "1.1. Fault Arc Detection Method Based on Mathematical Modeling", fontsize=8.5, fontname="helv")

    sub_rect = pymupdf.Rect(180, 575, 545, 720)
    sub_text = (
        "Traditional arc models are used to describe the electrical characteristics, behavior, and impact of arcs for fault detection and protection in power systems. Common models include the empirical model, Elmore model, Sato model, and Mayr model. Each model has its own strengths and limitations, and the choice of model depends on the specific application requirements, operating conditions, and desired accuracy. D. Lee and J. Kim conducted empirical modeling of arc faults based on experimental data [1]. T. Carter and J. Wang analyzed high-current arc faults on power systems based on the Elmore model [2]."
    )
    page1.insert_textbox(sub_rect, sub_text, fontsize=8.2, fontname="times-roman")

    # Running Footer
    page1.insert_text((45, 810), "Energies 2024, 17, 4675. https://doi.org/10.3390/en17184675", fontsize=7.5, fontname="times-roman")
    page1.insert_text((400, 810), "https://www.mdpi.com/journal/energies", fontsize=7.5, fontname="times-roman")

    # Page 2
    page2 = doc.new_page(width=595, height=842)
    page2.insert_text((50, 40), "Energies 2024, 17, 4675", fontsize=8, fontname="times-roman")
    page2.insert_text((515, 40), "2 of 22", fontsize=8, fontname="times-roman")

    page2.insert_text((50, 75), "1.2. Fault Arc Detection Method Based on Physical Signals", fontsize=9, fontname="helv")
    p2_rect1 = pymupdf.Rect(50, 85, 545, 180)
    p2_text1 = (
        "Physical signals include arc light [5], arc sound [6], electromagnetic radiation [7,8], and changes in ambient temperature and pressure caused by an arc [9,10]. When the above characteristics of the arc are detected, the arc fault can be determined. C.D. Johnson discussed the practical application of using optical sensors to detect arc faults. The research focuses on the design, performance evaluation, and effectiveness of optical sensors in power systems [11]. M.R. Brown and H.A. Lee introduced acoustic emission technology in arc fault detection [12]."
    )
    page2.insert_textbox(p2_rect1, p2_text1, fontsize=8.2, fontname="times-roman")

    page2.insert_text((50, 195), "1.3. Fault Arc Detection Method Based on Electrical Signals", fontsize=9, fontname="helv")
    p2_rect2 = pymupdf.Rect(50, 205, 545, 310)
    p2_text2 = (
        "With the increasing variety of household appliances, arcs can occur during their operation, and the distribution of these appliances is random. This randomness makes it challenging to pinpoint the exact location of an arc fault. When an arc fault occurs, the current and voltage signals in the circuit become distorted and are not necessarily indicative of the arc's location. Therefore, detecting arc faults by measuring the circuit's current and voltage signals has become a widely used method. Current research focuses on signal selection, effective feature extraction, and intelligent recognition using machine learning models."
    )
    page2.insert_textbox(p2_rect2, p2_text2, fontsize=8.2, fontname="times-roman")

    page2.insert_text((50, 325), "2. Arc Fault Detection Model", fontsize=9.5, fontname="helv")
    p2_rect3 = pymupdf.Rect(50, 335, 545, 440)
    p2_text3 = (
        "There are many types of arc fault detection models. This paper proposes a low-voltage AC series arc detection model based on a one-dimensional convolutional neural network incorporating residual modules and the frost optimization algorithm. This detection model uses extracted time-domain, frequency-domain, and wavelet packet energy features as inputs. It was trained, validated, and tested on an established experimental data set. Experimental results show that this arc fault detection model has high detection accuracy."
    )
    page2.insert_textbox(p2_rect3, p2_text3, fontsize=8.2, fontname="times-roman")

    doc.set_metadata({
        "title": "Intelligent Identification Method of Low Voltage AC Series Arc Fault Based on Using Residual Model and Rime Optimization Algorithm",
        "author": "Xiao He, Takahiro Kawaguchi, Seiji Hashimoto",
        "subject": "Energies 2024, 17, 4675",
        "keywords": "series arc fault, CNN, Residual model, RIME algorithm"
    })

    out_path = Path("assets/docs/mdpi_arc_fault_sample.pdf")
    doc.save(str(out_path))
    doc.close()
    print(f"Generated MDPI sample PDF at: {out_path}")

if __name__ == "__main__":
    create_mdpi_sample()
