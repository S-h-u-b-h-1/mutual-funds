import unittest

from ingestion.company_mentions import detect_company_mentions


class CompanyMentionTests(unittest.TestCase):
    def test_matches_full_name_and_vetted_alias(self):
        full = detect_company_mentions("Reliance Industries reports quarterly results")
        alias = detect_company_mentions("TCS wins a large technology contract")
        self.assertIn("RELIANCE", {hit["name"] for hit in full})
        self.assertIn("TCS", {hit["name"] for hit in alias})

    def test_short_alias_requires_word_boundaries(self):
        hits = detect_company_mentions("April demand data remains mixed")
        self.assertNotIn("RELIANCE", {hit["name"] for hit in hits})

    def test_does_not_match_raw_tickers_or_generic_brand_words(self):
        hits = detect_company_mentions("Bel share market update: eternal growth and a titan quarter")
        symbols = {hit["name"] for hit in hits}
        self.assertNotIn("BEL", symbols)
        self.assertNotIn("ETERNAL", symbols)
        self.assertNotIn("TITAN", symbols)

    def test_emits_one_traceable_link_per_company(self):
        hits = detect_company_mentions("HDFC Bank: HDFC Bank earnings preview")
        self.assertEqual([{
            "entity_type": "company", "name": "HDFCBANK", "relation": "mentions", "rule_id": "company_name_exact"
        }], hits)


if __name__ == "__main__":
    unittest.main()
