"""Base factsheet adapter — fetch + parse with retry, versioning, lineage, audit logging."""

from __future__ import annotations

import io
import re
import time
import urllib.request
from abc import ABC, abstractmethod

from .normalize import SchemeMetadata, validate, completeness
from . import extract


class FactsheetAdapter(ABC):
    """One per AMC. Subclasses set label maps + a scheme splitter and implement parse_text."""

    amc_name: str = ""
    frequency: str = "monthly"
    polite_delay_s: float = 2.0          # be kind to AMC servers
    implemented: bool = False

    # Per-AMC label variants (overridable). Defaults cover common factsheet wording.
    LABELS_BENCHMARK = ["benchmark index", "benchmark", "tier i benchmark"]
    LABELS_MANAGER = ["fund manager", "fund managers", "managed by"]
    LABELS_INCEPTION = ["inception date", "date of allotment", "allotment date", "launch date"]
    LABELS_RISK = ["riskometer", "risk-o-meter"]
    LABELS_EXIT = ["exit load"]
    LABELS_SIP = ["minimum sip", "sip amount", "minimum installment"]
    LABELS_LUMPSUM = ["minimum investment", "minimum application", "lumpsum"]
    SCHEME_SPLIT = r"(?im)^\s*(?:scheme name|fund name)\s*[:\-]"

    @abstractmethod
    def factsheet_url(self, as_of=None) -> str:
        ...

    # ----- extraction -----
    def parse_scheme_block(self, block: str) -> SchemeMetadata:
        """Extract one scheme's metadata from its factsheet text block. None when unsure."""
        name = extract.labeled(block, ["scheme name", "fund name"]) or block.strip().splitlines()[0][:90]
        overall, reg, dir_ = extract.parse_expense(block)
        m = SchemeMetadata(
            scheme_code=None, scheme_name=name.strip()[:120], amc=self.amc_name,
            benchmark=extract.labeled(block, self.LABELS_BENCHMARK),
            fund_manager=extract.labeled(block, self.LABELS_MANAGER),
            expense_ratio=overall, regular_expense_ratio=reg, direct_expense_ratio=dir_,
            aum_crores=extract.parse_aum(block),
            riskometer=extract.labeled(block, self.LABELS_RISK),
            exit_load=extract.labeled(block, self.LABELS_EXIT),
            minimum_sip=extract.parse_amount(extract.labeled(block, self.LABELS_SIP)),
            minimum_lumpsum=extract.parse_amount(extract.labeled(block, self.LABELS_LUMPSUM)),
            holdings=extract.parse_holdings(block),
            sector_allocation=extract.parse_sectors(block),
        )
        # launch date best-effort
        m.launch_date = extract.parse_date(block, self.LABELS_INCEPTION)
        return m

    def parse_text(self, text: str) -> list[SchemeMetadata]:
        """Split a full factsheet into scheme blocks and parse each."""
        parts = re.split(self.SCHEME_SPLIT, text)
        blocks = [p for p in parts if len(p.strip()) > 40]
        return [self.parse_scheme_block(b) for b in blocks] if blocks else [self.parse_scheme_block(text)]

    def parse(self, pdf_bytes: bytes) -> list[SchemeMetadata]:
        """Extract text from the PDF (pypdf) then parse. Missing fields stay None."""
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        return self.parse_text(text)

    # ----- shared mechanics -----
    def fetch(self, url: str, retries: int = 3, timeout: int = 120) -> bytes:
        last = None
        for attempt in range(retries):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "mfpulse-research/1.0"})
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    return r.read()
            except Exception as e:  # noqa: BLE001 — log + backoff
                last = e
                time.sleep(self.polite_delay_s * (attempt + 1))
        raise RuntimeError(f"{self.amc_name}: fetch failed after {retries} tries: {last}")

    def run(self, as_of=None) -> dict:
        """Fetch + parse one AMC; return an audit record (never raises into the caller)."""
        url = self.factsheet_url(as_of)
        rec = {"amc": self.amc_name, "url": url, "status": "ok", "schemes": 0,
               "populated": 0, "problems": [], "rows": []}
        try:
            pdf = self.fetch(url)
            metas = self.parse(pdf)
            for m in metas:
                m.source = m.source or f"{self.amc_name} factsheet PDF"
                m.source_url = m.source_url or url
                problems = validate(m)
                if problems:
                    rec["problems"].append({m.scheme_name: problems})
                    continue
                if completeness(m) > 0:
                    rec["populated"] += 1
                rec["rows"].append(m)
            rec["schemes"] = len(metas)
        except Exception as e:  # noqa: BLE001
            rec["status"] = "failed"
            rec["error"] = str(e)
        return rec
