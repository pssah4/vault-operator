/**
 * Quality Gates -- post-execution checks that warn the agent about likely
 * mistakes (hallucinated citations, unverified claims). They are wired
 * into ToolExecutionPipeline and emit warnings into the tool result; they
 * never block execution.
 *
 * FEATURE-1804 / ADR-090.
 */

export { scanUnreadSources } from './HallucinationBrake';
