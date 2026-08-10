#!/usr/bin/env python3
"""Generate the public MF Pulse ranking and analysis methodology PDF."""

from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "mf-pulse-ranking-methodology.pdf"
PUBLIC = ROOT / "frontend" / "public" / "mf-pulse-ranking-methodology.pdf"

PAGE_W, PAGE_H = A4
NAVY = colors.HexColor("#0B1117")
INK = colors.HexColor("#17222D")
MUTED = colors.HexColor("#52606D")
LINE = colors.HexColor("#D9E2E8")
PALE = colors.HexColor("#F3F7F8")
MINT = colors.HexColor("#1AAE9F")
MINT_PALE = colors.HexColor("#E9F8F5")
AMBER = colors.HexColor("#B7791F")
AMBER_PALE = colors.HexColor("#FFF8E8")


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleWhite", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=28, leading=33, textColor=colors.white, spaceAfter=12))
styles.add(ParagraphStyle(name="SubWhite", parent=styles["BodyText"], fontName="Helvetica", fontSize=11, leading=17, textColor=colors.HexColor("#C8D4DB")))
styles.add(ParagraphStyle(name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=20, leading=25, textColor=INK, spaceBefore=8, spaceAfter=10))
styles.add(ParagraphStyle(name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=INK, spaceBefore=10, spaceAfter=6))
styles.add(ParagraphStyle(name="Bodyx", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=14, textColor=MUTED, spaceAfter=7))
styles.add(ParagraphStyle(name="Smallx", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.7, leading=11, textColor=MUTED))
styles.add(ParagraphStyle(name="Eyebrow", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=MINT, spaceAfter=5))
styles.add(ParagraphStyle(name="Formula", parent=styles["BodyText"], fontName="Courier-Bold", fontSize=8, leading=12, textColor=INK, backColor=PALE, borderPadding=6, spaceAfter=7))
styles.add(ParagraphStyle(name="Callout", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=14, textColor=INK, backColor=MINT_PALE, borderColor=MINT, borderWidth=0.7, borderPadding=9, spaceBefore=5, spaceAfter=10))
styles.add(ParagraphStyle(name="Warn", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=14, textColor=INK, backColor=AMBER_PALE, borderColor=AMBER, borderWidth=0.7, borderPadding=9, spaceBefore=5, spaceAfter=10))


def header_footer(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setStrokeColor(LINE)
        canvas.line(18 * mm, PAGE_H - 15 * mm, PAGE_W - 18 * mm, PAGE_H - 15 * mm)
        canvas.setFont("Helvetica-Bold", 7.5)
        canvas.setFillColor(INK)
        canvas.drawString(18 * mm, PAGE_H - 11 * mm, "MF PULSE")
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(PAGE_W - 18 * mm, PAGE_H - 11 * mm, "Ranking and analysis methodology - Version 3")
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 14 * mm, PAGE_W - 18 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 9 * mm, "Deterministic research. Not investment advice. Data sources: AMFI, SEBI and acquired AMC factsheets.")
    canvas.drawRightString(PAGE_W - 18 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def p(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullets(items):
    return [p(f"- {item}") for item in items]


def table(data, widths, header=True):
    wrapped = [[cell if hasattr(cell, "wrap") else p(str(cell), "Smallx") for cell in row] for row in data]
    t = Table(wrapped, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    rules = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, PALE]),
    ]
    if header:
        rules += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]
        for c in range(len(data[0])):
            wrapped[0][c] = Paragraph(str(data[0][c]), ParagraphStyle(name=f"TH{c}", parent=styles["Smallx"], fontName="Helvetica-Bold", textColor=colors.white))
    t.setStyle(TableStyle(rules))
    return t


def section(number, title, intro=None):
    items = [p(f"{number} / METHODOLOGY", "Eyebrow"), p(title, "H1x")]
    if intro:
        items.append(p(intro))
    return items


def build_story():
    story = []
    cover = Table([[p("MF PULSE", "Eyebrow")], [p("Ranking and analysis methodology", "TitleWhite")], [p("How fund, AMC and portfolio conclusions are calculated, explained, confidence-capped and compared.", "SubWhite")], [Spacer(1, 34 * mm)], [p("VERSION 3  |  EVIDENCE-AWARE ANALYSIS", "SubWhite")]], colWidths=[PAGE_W - 36 * mm], rowHeights=[12 * mm, 40 * mm, 25 * mm, 60 * mm, 12 * mm])
    cover.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("VALIGN", (0, 4), (0, 4), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 14 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 14 * mm), ("TOPPADDING", (0, 0), (-1, -1), 9 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 8 * mm)]))
    story += [Spacer(1, 8 * mm), cover, PageBreak()]

    story += section("01", "The evidence contract", "MF Pulse separates an observed fact from its interpretation and from the confidence permitted by the available evidence.")
    story += [table([
        ["Layer", "Meaning", "Example"],
        ["Observed fact", "A sourced or computed number.", "One-year AMFI NAV return: +12.4%."],
        ["Interpretation", "A deterministic rule with a disclosed scope.", "The fund led its matched peer average by 2.1 percentage points over the same period."],
        ["Confidence", "How strongly the interpretation may be stated.", "Developing track record; confidence capped at 70/100."],
        ["Boundary", "What the evidence cannot establish.", "No claim about future alpha, manager skill or suitability without supporting evidence."],
    ], [30 * mm, 60 * mm, 74 * mm]), Spacer(1, 4 * mm), p("A high evidence score means the conclusion is well supported by available data. It never means the future outcome is highly certain.", "Callout")]

    story += section("02", "Return and risk calculations")
    story += [p("Point-to-point return", "H2x"), p("Return = (Latest NAV / Earlier NAV - 1) x 100", "Formula"), p("Used for observed 1-day through 1-year windows. Three-year and five-year cumulative return is displayed as annualised CAGR."), p("CAGR = (1 + total return)^(1 / years) - 1", "Formula"), p("Annualised volatility", "H2x"), p("Volatility = standard deviation of daily returns x square root of 252", "Formula"), p("Maximum drawdown", "H2x"), p("The deepest peak-to-trough fall inside the disclosed observation window. A less-negative drawdown is shallower and therefore preferable for downside control."), p("Consistency", "H2x"), p("The current daily consistency measure is the share of observed NAV moves that are non-negative. It is steadiness evidence, not proof of superior total return."), p("Risk-ratio discipline", "H2x"), p("Return and volatility periods should be aligned. Ratios that mix a one-year return with only 90-day volatility are labelled as limited until a matching one-year risk series is available.", "Warn")]

    story += [PageBreak()] + section("03", "What a category rank means")
    story += [p("Current recent category rank", "H2x"), p("Eligible Equity Growth funds are grouped by category and plan, with Direct and Regular kept separate. The cohort is sorted by one-month NAV return. Rank 1 is the highest recent return."), p("Percentile = 100 x (1 - (rank - 1) / cohort size)", "Formula"), p("This is explicitly a recent momentum position. It is not a universal long-term quality rank.", "Warn"), p("Normal rank is withheld or treated as provisional when a fund is too new, the peer cohort is too small, the scheme is IDCW, or the scheme type needs evidence that NAV return alone cannot provide.")]

    story += section("04", "Different schemes require different frameworks")
    story += [table([
        ["Scheme framework", "Primary judgment evidence", "Evidence currently missing when applicable"],
        ["Active equity", "Rolling and long-horizon peer return; benchmark excess return; drawdown; downside consistency; cost; concentration; manager process.", "Broad TER, holdings and manager-history coverage; exact TRI history for all benchmarks."],
        ["Passive / index", "Tracking difference and tracking error; TER; replication quality; liquidity; matched-index return.", "Official matched TRI series and tracking evidence for every index."],
        ["Debt", "Yield to maturity; duration; credit quality; liquidity; drawdown; cost.", "Duration, YTM, credit-quality and portfolio-liquidity coverage."],
        ["Hybrid", "Allocation stability; equity/debt mix; downside control; risk-adjusted return; cost and diversification.", "Historical allocation path and broader portfolio evidence."],
        ["Goal-based", "Goal and lock-in fit; horizon-matched return; drawdown near the goal date; cost and glide-path consistency.", "Full goal-path and portfolio-allocation evidence."],
        ["NFO / emerging", "Since-inception return; same-date benchmark and vintage peers; early drawdown; portfolio construction; explicit confidence cap.", "Full-cycle history by definition."],
    ], [30 * mm, 70 * mm, 64 * mm])]

    story += [PageBreak()] + section("05", "Track-record stages and confidence caps")
    story += [table([
        ["Stage", "History rule", "Maximum confidence", "Ranking treatment"],
        ["Observation only", "Under about 3 months, or no usable 3M/1Y evidence", "25/100", "No normal performance rank"],
        ["Emerging evidence", "Under 1 year, or no 1Y return", "45/100", "Launch-date and vintage-matched comparison"],
        ["Developing track record", "1-3 years, or no 3Y/5Y evidence", "70/100", "Structured comparison with medium ceiling"],
        ["Established track record", "At least 3Y evidence", "100/100", "Eligible for the broadest supported analysis"],
    ], [34 * mm, 63 * mm, 30 * mm, 37 * mm]), Spacer(1, 4 * mm), p("Evidence confidence combines performance history (30 points), risk evidence (20), peer evidence (15), benchmark mapping (10), cost (10), portfolio evidence (10) and freshness (5). The track-record stage caps the result.", "Callout")]

    story += section("06", "Fund-level reasoning box")
    story += [p("Every fund page explains:", "H2x")] + bullets([
        "The applicable scheme framework and track-record stage.",
        "The evidence confidence score and any history-based cap.",
        "Why the displayed return, risk and peer facts were selected.",
        "Evidence-backed strengths and weaknesses with exact values.",
        "Why the current category rank is narrow, provisional or unavailable.",
        "Which missing inputs prevent stronger conclusions.",
    ])
    story += [p("New-fund treatment", "H2x"), p("An NFO should not be compared with a ten-year fund over unmatched periods. Existing peers and the benchmark must be measured from the NFO launch date to the same current date. Under one year, return remains an absolute since-inception figure rather than an aggressively annualised claim."), p("Bayesian-style shrinkage is recommended for a future NFO leaderboard so a few early observations do not create extreme ranks: adjusted result = w x observed result + (1 - w) x category average, with w increasing as observations accumulate.", "Callout")]

    story += [PageBreak()] + section("07", "Health and quality scores")
    story += [p("The current Health Score is a deterministic research indicator built from available performance, consistency, risk, recent category position, data quality, cost and factsheet evidence. Missing components are dropped and remaining weights are renormalised."), p("Important limitation", "H2x"), p("Renormalisation prevents missing data from becoming zero, but two equal scores can be based on different evidence sets. MF Pulse therefore displays a separate evidence-confidence score and does not treat the Health grade as a forecast or universal buy recommendation.", "Warn"), p("Recommended evolution", "H2x"), p("Keep investment merit separate from evidence quality. A future score should show Merit and Evidence side by side, avoid double-counting recent category percentile, use aligned risk/return windows, and graduate only after walk-forward backtesting.")]

    story += [PageBreak()] + section("08", "AMC analysis")
    story += [p("AMC analysis begins by canonicalising plan variants. Direct and Regular versions of the same investment idea are not counted as separate funds in the AMC peer sample."), p("Current AMC evidence considers:", "H2x")] + bullets([
        "Average canonical fund-health evidence.",
        "Share of eligible canonical funds beating their own category average over one year.",
        "Share holding a recent top-quartile category position.",
        "Observed average volatility.",
        "Share with both one-year return and volatility evidence.",
    ])
    story += [p("Headline AMC peer rank requires at least three canonical funds with one-year evidence and at least 50% score-input completeness. Otherwise the rank is withheld or explicitly provisional.", "Callout"), p("AMC analysis does not infer governance quality, service quality, corporate creditworthiness, profitability or unsupported AUM and flow claims.", "Warn")]

    story += section("09", "Fund comparison rules")
    story += [table([
        ["Dimension", "Leader rule", "Interpretation boundary"],
        ["Return", "Higher observed return over the same window", "Different categories can carry very different risk."],
        ["Volatility", "Lower observed annualised volatility", "Window-specific, not lifetime risk."],
        ["Drawdown", "Less-negative maximum drawdown", "Only the observed period."],
        ["Consistency", "Higher share of non-negative daily NAV moves", "Not a substitute for rolling peer outperformance."],
        ["Health", "Higher deterministic research score", "Evidence sets may differ; not a forecast."],
    ], [33 * mm, 59 * mm, 72 * mm]), Spacer(1, 4 * mm), p("An overall measured lead is shown only when selected funds share category and plan context. When categories or plan types differ, metric leaders remain factual but MF Pulse withholds an overall winner.", "Callout")]

    story += [PageBreak()] + section("10", "Portfolio health, risk and projected ranges")
    story += [p("Portfolio Health Score", "H2x"), p("Health keeps investment merit separate from evidence confidence. Available components are quality (25%), diversification (20%), inverse concentration (15%), overlap (10%), downside resilience (20%) and asset balance (10%). Missing components are dropped and remaining weights are renormalised."), p("Expected annual return", "H2x"), p("Each holding starts with a versioned nominal category planning prior. Capped observed evidence can tilt, but never replace, that prior."), p("Model return = prior x (1 - credibility) + observed return x credibility", "Formula"), p("Observed evidence combines 3Y CAGR, 1Y return and annualised 3M return after conservative caps. Credibility is capped at 50%. New funds therefore stay close to their category prior and receive lower evidence confidence."), p("Covariance-aware volatility", "H2x"), p("Portfolio volatility = sqrt(sum_i sum_j w_i w_j sigma_i sigma_j rho_ij)", "Formula"), p("The model uses holding-level 90-day annualised volatility where available and category defaults otherwise. A disclosed category-correlation matrix approximates diversification because complete aligned daily histories are not yet available for every scheme."), p("Projection bands and loss probability", "H2x"), p("The 1Y, 3Y and 5Y bands show 10th, 50th and 90th model percentiles. Volatility receives an uncertainty multiplier tied to evidence confidence plus a 15% tail-width inflation. Values assume no additions, withdrawals, tax or fees."), p("Stress tests", "H2x"), p("Equity sell-off, rates and credit shock, and inflation and currency shock apply deterministic category shocks. Concentration and duplicate exposure amplify the impact. No probability is assigned to a stress test."), p("These outputs are planning distributions, not price targets or guaranteed returns. They do not model market timing, future cash flows, tax, regime changes, manager changes or investor behaviour.", "Warn")]

    story += [PageBreak()] + section("11", "Validation and model governance")
    story += [p("A transparent formula is not automatically a predictive model. Predictive claims require walk-forward validation using only the data available at each historical date."), p("Required validation", "H2x")] + bullets([
        "Calculate every fund score at historical month-end using only then-available data.",
        "Measure benchmark excess return, category percentile and drawdown 6, 12 and 36 months later.",
        "Compare the score against simple baselines: category median, lowest TER, highest 3Y return and rolling benchmark win rate.",
        "Measure score turnover, top-quartile persistence and failure rates for high grades.",
        "Publish the test period, eligible universe, survivorship treatment and confidence intervals.",
    ])
    story += [p("Until this validation is complete, MF Pulse describes the composite indicators as research aids, not proven predictors.", "Warn")]

    story += section("12", "Data safeguards and limitations")
    story += bullets([
        "Stale long-period returns are withheld rather than extrapolated.",
        "IDCW NAV-only performance is withheld because payouts distort NAV comparisons.",
        "Extreme return bands are treated as probable NAV discontinuities and suppressed.",
        "Missing TER, holdings, AUM or manager evidence is labelled, never estimated.",
        "Exact benchmark analytics are limited to supported matched index histories and disclose any price-index-versus-TRI proxy.",
        "Debt-fund ranking remains incomplete without duration, yield, credit quality and liquidity evidence.",
        "Past performance and high evidence confidence do not guarantee future results.",
    ])
    story += [Spacer(1, 6 * mm), p("Methodology status", "H2x"), p("Version 3 adds portfolio health v2, evidence-shrunk return ranges, covariance-aware risk and deterministic stress testing. Future versions should add aligned long-window risk series, official TRI histories, debt analytics, broader factsheet coverage and published walk-forward model validation.", "Callout")]
    return story


def generate(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    frame = Frame(18 * mm, 18 * mm, PAGE_W - 36 * mm, PAGE_H - 42 * mm, leftPadding=0, rightPadding=0, topPadding=3 * mm, bottomPadding=3 * mm)
    doc = BaseDocTemplate(str(path), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm, title="MF Pulse Ranking and Analysis Methodology", author="MF Pulse")
    doc.addPageTemplates([PageTemplate(id="methodology", frames=[frame], onPage=header_footer)])
    doc.build(build_story())


if __name__ == "__main__":
    generate(OUTPUT)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.write_bytes(OUTPUT.read_bytes())
    print(OUTPUT)
    print(PUBLIC)
