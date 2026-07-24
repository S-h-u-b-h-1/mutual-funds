// Shared verified-bank-account lookup — extracted from redemptionService.js (Redemption
// Contract) since the Provider Metadata slice needs the identical query for a purchase's
// payment SOURCE account, not just a redemption's payout DESTINATION account. One query, one
// place, both directions of money movement read it the same way.
import { query } from "../db.js";

export async function getVerifiedBankAccount(userId) {
  const r = await query(
    `select id, account_number_masked, ifsc, account_holder_name
     from bank_accounts where user_id = $1 and verified = true
     order by is_primary desc, created_at desc limit 1`,
    [userId]
  );
  return r.rows[0]
    ? { id: r.rows[0].id, accountNumberMasked: r.rows[0].account_number_masked, ifsc: r.rows[0].ifsc, accountHolderName: r.rows[0].account_holder_name }
    : null;
}
