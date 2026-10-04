# Evaluation

Talkative separates **deterministic local heuristics** from **provider-dependent AI quality** so results are reproducible and claims stay honest.

## Reproducible heuristic evaluation

Run:

```bash
npm run eval:heuristics
```

This evaluates labeled fixtures in `evaluation/heuristic-fixtures.json` for:

- speaker attribution decisions;
- echo/suggestion-loop suppression;
- echo precision, recall, accuracy and confusion counts.

The fixture set is intentionally small and transparent. It is a regression/evaluation harness, **not** evidence of production-world accuracy.

## Unit tests

Run:

```bash
npm test
```

The tests cover language-tag normalization, enrollment priority, TTS timing fallback, word normalization, overlap thresholds and unrelated-speech rejection.

## Next empirical benchmarks

The next portfolio-quality evaluation should use recorded, consented conversation clips and report:

1. **ASR:** word error rate by language and noise condition.
2. **Speaker attribution:** accuracy and confusion matrix, including same-language conversations.
3. **Echo suppression:** false-positive and false-negative rates on device-recorded TTS leakage.
4. **Latency:** median and P95 for audio → transcript, transcript → translation, TTS start and suggestions.
5. **Translation:** a documented human rating protocol or a standard metric on an appropriate multilingual corpus.

No numbers should be added to the README until they are produced by a checked-in script or a documented human evaluation.
