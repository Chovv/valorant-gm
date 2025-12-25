// src/utils/letterGrade.ts
// Utility to convert numeric ratings to letter grades

export type LetterGrade = 'S+' | 'S' | 'S-' | 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F';

/**
 * Convert a numeric rating (0-100) to a letter grade
 */
export function toLetterGrade(value: number): LetterGrade {
  if (value >= 95) return 'S+';
  if (value >= 90) return 'S';
  if (value >= 85) return 'S-';
  if (value >= 80) return 'A+';
  if (value >= 75) return 'A';
  if (value >= 70) return 'A-';
  if (value >= 65) return 'B+';
  if (value >= 60) return 'B';
  if (value >= 55) return 'B-';
  if (value >= 50) return 'C+';
  if (value >= 45) return 'C';
  if (value >= 40) return 'C-';
  if (value >= 35) return 'D+';
  if (value >= 30) return 'D';
  if (value >= 25) return 'D-';
  return 'F';
}

/**
 * Get CSS class for a letter grade (for coloring)
 */
export function getGradeClass(grade: LetterGrade): string {
  if (grade.startsWith('S')) return 'grade-s';
  if (grade.startsWith('A')) return 'grade-a';
  if (grade.startsWith('B')) return 'grade-b';
  if (grade.startsWith('C')) return 'grade-c';
  if (grade.startsWith('D')) return 'grade-d';
  return 'grade-f';
}

/**
 * Get CSS class directly from numeric value
 */
export function getGradeClassFromValue(value: number): string {
  return getGradeClass(toLetterGrade(value));
}