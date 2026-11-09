/**
 * SIEVE Domain Core: Type Contracts & Schema Index
 *
 * Central domain exports adhering to Clean Architecture & Domain-Driven Design:
 * - Nominal branded primitive types (eliminating IEEE-754 precision drift)
 * - Search term entity models and platform targeting match types
 * - N-Gram aggregates and linguistic classifications
 * - Safety shield collision verdicts and negative exclusion rules
 * - Match dilution and CPC cannibalization records
 * - Econometric bid elasticity spectrum and convex reallocation yield
 * - DuckDB analytical virtual table relational schemas
 */

export * from './primitives.ts';
export * from './search_term.ts';
export * from './dilution.ts';
export * from './ngram.ts';
export * from './shield.ts';
export * from './econometric.ts';
export * from './schema.ts';
