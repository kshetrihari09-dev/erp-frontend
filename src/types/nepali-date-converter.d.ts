/**
 * nepali-date-converter ships no TypeScript declarations of its own
 * (confirmed against the published package — dist/ has only .js + .js.map).
 * This covers just the surface this app actually uses.
 */
declare module 'nepali-date-converter' {
  interface BsParts { year: number; month: number; date: number; day: number }
  interface AdParts { year: number; month: number; date: number; day: number }

  export default class NepaliDate {
    /** AD Date → BS. Reads the Date's exact instant, so always pass a
     *  UTC-midnight Date built from Y/M/D components — see
     *  utils/nepaliDate.ts's normalizedUTCDate for why. */
    constructor(adDate: Date)
    /** BS Y/M/D → BS (month is 0-indexed, like the native JS Date). */
    constructor(year: number, month: number, date: number)
    constructor()

    format(pattern: string): string
    toJsDate(): Date
    getDay(): number
    getYear(): number
    getMonth(): number
    getDate(): number
    getBS(): BsParts
    getAD(): AdParts
  }

  export const dateConfigMap: Record<string, Record<string, number>>
}
