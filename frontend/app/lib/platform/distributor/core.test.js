// Distributor Identity & Regulatory Configuration tests — real Neon, no mocks. Asserts the REAL
// production ARN/EUIN (sql/neon/017_distributor_identity.sql) rather than fixture values, since
// the whole point of this module is that these are the actual confirmed Suasion Securities
// credentials, not a placeholder — see docs/DISTRIBUTOR_IDENTITY.md.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { query } from "../../db.js";
import { getDefaultDistributorAttribution, getDistributorAttributionForAdvisor, getDistributorProfile } from "./core.js";
import { createTestUser, deleteTestUser } from "../../invest/testHelpers.js";

const RUN = crypto.randomBytes(3).toString("hex");
const REAL_ARN = "289322";
const REAL_EUIN = "E544323";

describe("getDefaultDistributorAttribution", () => {
  it("returns the real, confirmed Suasion Securities ARN/EUIN — not a placeholder", async () => {
    const attribution = await getDefaultDistributorAttribution();
    expect(attribution.arn).toBe(REAL_ARN);
    expect(attribution.euin).toBe(REAL_EUIN);
    expect(attribution.distributor_name).toBe("Suasion Securities");
  });
});

describe("getDistributorAttributionForAdvisor", () => {
  it("falls back to the default when no advisorId is given", async () => {
    const attribution = await getDistributorAttributionForAdvisor(null);
    expect(attribution.euin).toBe(REAL_EUIN);
  });

  it("falls back to the default when the given advisor has no EUIN mapped to them", async () => {
    const userId = await createTestUser(`distributor-unmapped-${RUN}`);
    try {
      const advisor = await query(`insert into advisors (user_id) values ($1) returning id`, [userId]);
      const attribution = await getDistributorAttributionForAdvisor(advisor.rows[0].id);
      expect(attribution.euin).toBe(REAL_EUIN); // no EUIN row references this advisor, so it falls back
    } finally {
      await deleteTestUser(userId); // cascades to the advisors row
    }
  });

  it("prefers an EUIN specifically mapped to the given advisor over the default", async () => {
    const userId = await createTestUser(`distributor-mapped-${RUN}`);
    const testEuin = `TEST${RUN}`;
    let euinRowId;
    try {
      const advisor = await query(`insert into advisors (user_id) values ($1) returning id`, [userId]);
      const arnRow = await query(`select id from distributor_arns where arn = $1`, [REAL_ARN]);
      const euinRow = await query(
        `insert into distributor_euins (distributor_arn_id, euin, advisor_id, is_default) values ($1, $2, $3, false) returning id`,
        [arnRow.rows[0].id, testEuin, advisor.rows[0].id]
      );
      euinRowId = euinRow.rows[0].id;

      const attribution = await getDistributorAttributionForAdvisor(advisor.rows[0].id);
      expect(attribution.euin).toBe(testEuin);
      expect(attribution.arn).toBe(REAL_ARN); // same firm, individual-employee-level EUIN under it
    } finally {
      if (euinRowId) await query(`delete from distributor_euins where id = $1`, [euinRowId]);
      await deleteTestUser(userId);
    }
  });
});

describe("getDistributorProfile", () => {
  it("returns the firm plus every EUIN registered under it", async () => {
    const profile = await getDistributorProfile(REAL_ARN);
    expect(profile.distributor_name).toBe("Suasion Securities");
    expect(profile.euins.some((e) => e.euin === REAL_EUIN && e.is_default)).toBe(true);
  });

  it("returns null for an unknown ARN", async () => {
    expect(await getDistributorProfile("does-not-exist")).toBeNull();
  });
});
