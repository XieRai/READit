import json
from google import genai
import pymupdf
from app.config import get_gemini_api_key

api_key = get_gemini_api_key()
client = genai.Client(api_key=api_key)

doc = pymupdf.open("assets/docs/mdpi_arc_fault_sample.pdf")
page = doc[0]
raw_text = page.get_text("text")

system_prompt = """You are an expert academic document layout intelligence engine.
Analyze the provided raw text extracted from an academic paper page.
Reconstruct the true semantic hierarchy into clean, valid JSON.
Ignore running headers/footers. Separate sidebars and citation boxes from the main body text.
Group lines into true, complete paragraphs under their respective section and subchapter.

Output JSON with this exact schema:
{
  "title": "string or null",
  "authors": "string or null",
  "affiliations": "string or null",
  "abstract": "string or null",
  "keywords": "string or null",
  "sidebars": ["array of sidebar/citation metadata strings"],
  "sections": [
    {
      "section_number": "1",
      "heading": "1. Introduction",
      "subsections": [
        {
          "subsection_number": "1.1",
          "heading": "1.1. Fault Arc Detection Method...",
          "paragraphs": [
            "Complete paragraph 1 text...",
            "Complete paragraph 2 text..."
          ]
        }
      ]
    }
  ],
  "captions": ["any figure or table captions"]
}
"""

user_prompt = f"Raw text extracted from Page 1:\n\n{raw_text}"

print("Calling Gemini (gemini-3.8-flash) for semantic structuring...")
response = None
for model_name in ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-flash-latest"]:
    try:
        response = client.models.generate_content(
            model=model_name,
            contents=user_prompt,
            config={
                "system_instruction": system_prompt,
                "temperature": 0.1,
                "response_mime_type": "application/json"
            }
        )
        print(f"Model {model_name} succeeded!")
        break
    except Exception as e:
        print(f"Model {model_name} failed: {e}")

if response and response.text:
    print("\n--- GEMINI STRUCTURED RESULT ---")
    result_json = json.loads(response.text)
    print(json.dumps(result_json, indent=2))
else:
    print("No response returned.")
