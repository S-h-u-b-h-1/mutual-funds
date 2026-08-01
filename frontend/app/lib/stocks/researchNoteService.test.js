import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { upsertResearchNote, getResearchNote, getResearchNotes, getResearchNoteVersionHistory } from "./researchNoteService.js";
import { createTestCompany, deleteTestCompany } from "./testHelpers.js";
import { createTestUser, deleteTestUser } from "../invest/testHelpers.js";

describe("researchNoteService (integration, real Neon, disposable user + company)", () => {
  let userId, companyId;

  beforeAll(async () => {
    userId = await createTestUser("stock-research-note");
    companyId = await createTestCompany({ label: "research-note" });
  });

  afterAll(async () => {
    await deleteTestCompany(companyId);
    await deleteTestUser(userId);
  });

  it("creates a note at version 1 with no prior version snapshot", async () => {
    const note = await upsertResearchNote({ userId, companyId, thesis: "Strong moat, undervalued.", risks: "Regulatory risk." });
    expect(note.version).toBe(1);
    const history = await getResearchNoteVersionHistory(note.id);
    expect(history.length).toBe(0);
  });

  it("editing the note bumps the version and snapshots the PRIOR content, never losing it", async () => {
    const before = await getResearchNote(userId, companyId);
    const updated = await upsertResearchNote({ userId, companyId, thesis: "Updated thesis after Q1 results.", risks: "Regulatory risk, now easing." });
    expect(updated.version).toBe(2);
    expect(updated.id).toBe(before.id); // same row, not a new note

    const history = await getResearchNoteVersionHistory(updated.id);
    expect(history.length).toBe(1);
    expect(history[0].version).toBe(1);
    expect(history[0].snapshot.thesis).toBe("Strong moat, undervalued."); // the OLD content, preserved
  });

  it("one note per user per company: a second upsert never creates a second note row", async () => {
    const notes = await getResearchNotes(userId);
    expect(notes.filter((n) => n.companyId === companyId).length).toBe(1);
  });
});
