# Bulk question importer

Load a whole solved-paper section into a **mock test** or **contest** in one shot,
instead of adding questions one at a time in the admin UI. Local figure images are
uploaded to S3 automatically and rewritten to hosted URLs before import.

## Two-step workflow

### 1. PDF → `questions.json` (LLM-assisted)

Feed the paper (or a section's text) to an LLM with the prompt below. Your solved-paper
PDFs already contain the **answer key + explanations**, so `correctOption` and `solution`
get filled in for free.

For questions whose **figure is essential** (non-verbal reasoning, dice, folding paper,
DI graphs, geometry), crop the figure to an image file (e.g. `q13.png`) and reference it
with `"imageFile": "q13.png"` — the importer uploads it. Put all such images in one folder.

<details>
<summary><strong>Extraction prompt (reusable across the 30-paper book)</strong></summary>

```
You are converting an SSC CGL solved-paper section into JSON for import.

Output ONLY a JSON array. Each element:
{
  "questionType": "STANDARD",
  "text": "<full question text>",
  "optionA": "...", "optionB": "...", "optionC": "...", "optionD": "...",
  "correctOption": "A" | "B" | "C" | "D",   // from the answer key / explanations
  "difficulty": "EASY" | "MEDIUM" | "HARD", // your best estimate
  "solution": "<short explanation from the paper, or omit>",
  "marks": 2, "negativeMarks": 0.5
}

Rules:
- One object per question, in order.
- Use the explanations section to set correctOption (A–D) and a concise solution.
- If a question CANNOT be answered without a figure/diagram/graph, add
  "imageFile": "qN.png" (N = question number) and still fill the text/options.
- For a mock test, DO NOT include "subject" (it is filed under the mock's section).
  For a contest, add "subject": "QUANT" | "REASONING" | "ENGLISH" | "GK" per question.
- Do not invent options or answers. If the answer key is unclear, omit correctOption
  and flag it in the text with a leading "TODO:".
```
</details>

### 2. `questions.json` → platform (this script)

```bash
cd scripts/import-questions

# auth: a token, or admin email+password (script logs in)
export API_URL=https://your-api-host          # default http://localhost:4000
export ADMIN_EMAIL=you@example.com
export ADMIN_PASSWORD=********
# or: export ADMIN_TOKEN=eyJhbGciOi...        # copy from admin site localStorage "token"

# dry run first — validates + shows what would upload, sends nothing
node import.mjs --target mock --id <MOCK_ID> --file questions.json --images ./figures --dry

# real run
node import.mjs --target mock --id <MOCK_ID> --file questions.json --images ./figures
```

Flags:
- `--target mock|contest`
- `--id` the mock test id or contest id (from its admin URL)
- `--file` path to your questions JSON array
- `--images` folder holding the `imageFile` images (default: the JSON file's folder)
- `--dry` validate and preview without uploading or importing

## Notes

- **Duplicates are skipped** server-side (same fingerprint), so re-running is safe.
- `imageFile` must be png/jpg/gif/webp (≤ 5 MB). It's uploaded via `/admin/upload`,
  which needs `S3_BUCKET` configured on the backend.
- Mock import fills `subject` from the mock's own section when a row omits it.
- See `questions.example.json` for the shape (one text question, one with an image).
