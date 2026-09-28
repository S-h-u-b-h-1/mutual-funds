import urllib.parse
from scripts import ingest_news as news


def test_lookup_encodes_publisher_fragments_and_query_strings(monkeypatch):
    urls = ['https://publisher.example/story#publisher=newsstand', 'https://publisher.example/?a=1&b="two"']
    paths = []
    monkeypatch.setattr(news, '_get', lambda path: paths.append(path) or [])
    news.lookup_articles(urls)
    assert len(paths) == 1
    assert '#' not in paths[0]
    params = urllib.parse.parse_qs(urllib.parse.urlsplit(paths[0]).query)
    assert set(params) == {'url', 'select'}
    assert '#publisher=newsstand' in params['url'][0]
    assert '\\"two\\"' in params['url'][0]


def test_large_feed_is_bounded_and_deduplicated(monkeypatch):
    paths = []
    monkeypatch.setattr(news, '_get', lambda path: paths.append(path) or [{'id': len(paths)}])
    urls = [f'https://publisher.example/{i}/' + 'x' * 200 for i in range(200)]
    result = news.lookup_articles(urls + urls[:10])
    assert len(paths) == len(result) == 20
    assert all(len(path) < 6000 for path in paths)


def test_empty_lookup_does_not_send_invalid_filter(monkeypatch):
    monkeypatch.setattr(news, '_get', lambda path: (_ for _ in ()).throw(AssertionError(path)))
    assert news.lookup_articles([]) == []


def test_rbi_local_clock_is_not_ci_utc():
    assert news.parse_publication_time('Tue, 08 Sep 2026 16:00:00', 'https://www.rbi.org.in/pressreleases_rss.xml') == '2026-09-08T10:30:00+00:00'


def test_unknown_timezones_and_date_only_publications_are_not_invented():
    assert news.parse_publication_time('Tue, 08 Sep 2026 16:00:00', 'https://publisher.example/feed') is None
    assert news.parse_publication_time('07 Sep, 2026 +0530', 'https://www.sebi.gov.in/sebirss.xml') is None


def test_new_article_count_uses_insert_results_not_same_day_age(monkeypatch):
    recorded = []
    monkeypatch.setattr(news, 'ensure_source', lambda *args: 1)
    monkeypatch.setattr(news, 'fetch_rss', lambda url: [dict(title='Example', url=f'https://example.com/{i}', summary='', published_at=None) for i in [1, 2]])
    monkeypatch.setattr(news, 'classify', lambda *args: dict(category='macro', importance_score=0, market_relevance_score=0, sentiment_label='neutral', links=[], matched_keywords=[]))
    monkeypatch.setattr(news, 'detect_company_mentions', lambda *args: [])
    monkeypatch.setattr(news.neon_db, 'dual_write', lambda fn: None)
    monkeypatch.setattr(news, 'lookup_articles', lambda urls: [dict(id=i, url=url, fetched_at='2026-09-08T00:00:00Z') for i, url in enumerate(urls, 1)])
    monkeypatch.setattr(news, 'ensure_entities', lambda values: {})
    def post(table, rows, **kwargs):
        recorded.append((table, rows))
        return [{'id': 2}] if table == 'news_articles' else []
    monkeypatch.setattr(news, '_post', post)
    assert news.run_source('Example', 'rss', 'https://example.com/feed', 'official') == ('success', 2, 1)
    run = next(rows[0] for table, rows in recorded if table == 'news_ingestion_runs')
    assert run['articles_duplicate'] == 1
