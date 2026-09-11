---
name: grilling
description: >-
  Grill the user relentlessly about a plan, decision, or idea. Use when the
  user wants to stress-test their thinking, or uses any grill trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask *now* without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a *later* round, not this one.

Finding *facts* is your job, never the user's. When a frontier question needs a fact from the vault or a file, use WikiHome tools (`search_pages`, `read_page`, `list_pages`, `get_graph`, `convert_to_markdown`); don't ask the user for anything you could look up yourself. Don't block the rest of the round on that lookup: only questions downstream of the missing fact wait. The *decisions* are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

Source: Matt Pocock skills (MIT) https://github.com/mattpocock/skills
