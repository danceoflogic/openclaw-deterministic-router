# Study: <descriptive title>

- **Research question:**
- **Issue / PR / source commit:**
- **Status:** planned | collecting | analysed | concluded | blocked
- **Date and investigator:**
- **Runtime and auth route:**
- **Environment / permissions:** 

## Hypotheses and alternative explanations

Separate claims that could be falsified. Include plausible confounders.

## Method and controls

Describe workloads, fixed vs varied settings, sample selection, ordering, success criteria, and when the experiment stops. Avoid redundant inference solely to satisfy a fixed call count.

## Instrumentation and evidence provenance

Specify native/provider signals, timestamps/correlation IDs, sanitized artifact paths, and locations of private supporting evidence. Record absent telemetry.

## Results

| Run | Configuration | Task success | Requests | Input | Cached | Uncached | Output incl. reasoning | Reasoning subset | Duration | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |

Include per-request traces when useful. Label partial or unmatched runs explicitly.

## Findings

- **Measured:**
- **Likely explanations:**
- **Not established:**
- **Other surprises / failures:**

## Cost and reliability

Use verified rates and distinguish API-equivalent estimates from actual billed cost. Compare resources **per correct completed task**, retries and repair work, not just per request.

## Recommendations and next decision

Rank fixes by evidence, likely benefit, complexity and risk. Note the decision owner, whether changes were authorized, and TEST restoration status.
