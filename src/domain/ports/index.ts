/**
 * SIEVE Domain Core: Port Interfaces Index
 *
 * Clean Architecture decoupled port contracts for core computation engines:
 * - INgramTokenizerPort: Search term decomposition, intent classification, stopword masking, Wilson bounds.
 * - IMatchDilutionPort: Query match type comparison, hijacked click detection, CPC inflation, lost budget.
 * - IConversionShieldPort: Safe-list registration, collision verdicts, exact bracket-lock fallback.
 * - IEconometricEnginePort: Break-even bid ceilings, elasticity spectrum mapping, convex reallocation yield.
 * - IAnalyticalDatabasePort: In-browser SQL querying, virtual table registration, diagnostic preset audits.
 */

export * from './tokenizer_port.ts';
export * from './dilution_port.ts';
export * from './shield_port.ts';
export * from './econometric_port.ts';
export * from './database_port.ts';
