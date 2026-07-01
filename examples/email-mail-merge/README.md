# Example: email list → mail merge

A tiny, runnable ScriptPipe pipeline that takes a 5-record email list and produces
mail-merged emails, flowing through **every** layer.

```text
source   data/source/contacts.csv  +  templates/welcome.txt
   ↓  ingestContacts
bronze   data/bronze/contacts.json      (raw contacts, captured verbatim)
   ↓  cleanContacts
silver   data/silver/contacts.json      (trimmed, lowercased, validated)
   ↓  renderEmails
gold     data/gold/emails.json          (rendered subject + body per contact)

         ⇢ a consuming app reads gold and sends the emails (the "sink" is outside ScriptPipe)
```

Gold is the terminal layer. ScriptPipe produces the rendered emails; actually sending them
is the consuming app's job.

Only `data/source/` and `templates/` are committed — the bronze/silver/gold
layers are generated when you run the pipeline.

## Run it

From the repo root (dependencies installed with `npm install`):

```bash
npm start -w @scriptpipe/example-email-mail-merge
```

Then look at the generated layers, e.g. `data/silver/contacts.json` (note the cleaned
emails and derived first names) and `data/gold/emails.json` (the rendered emails a consuming
app would send).

Reset the generated output with:

```bash
npm run clean -w @scriptpipe/example-email-mail-merge
```

## What it shows

- **Assets** carry a `layer` and a `uri` (here, absolute file paths derived from the
  pipeline file's location).
- **Steps** are self-contained scripts that loop over their input records. Each `run`
  receives only the assets it declared via `reads`/`writes` — see `steps/`. They use the
  `readJson` / `writeJson` / `readText` helpers from `@scriptpipe/core`, passing the asset
  directly (e.g. `readJson(ctx.reads.rawContacts)`). CSV parsing stays local in `lib/io.ts`,
  since parsing an input format is a domain concern, not a framework one.
- **Execution order is derived**, not declared: `renderEmails` runs after `cleanContacts`
  because it reads the asset `cleanContacts` writes.
- **No silent fallbacks**: `cleanContacts` throws on an empty name, a malformed email, or
  an unknown plan instead of dropping the record.

The pipeline definition lives in [`email-mail-merge.pipeline.ts`](./email-mail-merge.pipeline.ts);
`run.ts` just calls `runPipeline` on it.
