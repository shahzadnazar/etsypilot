import { describe, expect, it } from 'vitest'
import { greetingName, initialsFor } from '@/lib/utils/name'

/*
 * Both of these were found by RUNNING the old expressions over real name
 * shapes, not by reading them. Each had survived review.
 *
 *   "O'Brien"      the avatar showed O' — punctuation, because the one-word
 *                  branch took the first two CHARACTERS rather than letters.
 *   "  Jo Ann"     the greeting was "Good morning, " with nothing after it:
 *                  split(' ')[0] on a leading space is the empty string.
 */

describe('the greeting never comes out empty', () => {
  it('uses the first word', () => {
    expect(greetingName('Farhan Jamal')).toBe('Farhan')
    expect(greetingName('Anne-Marie Smith')).toBe('Anne-Marie')
  })

  it('survives leading, trailing and doubled whitespace', () => {
    // The defect. "  Jo Ann".split(' ')[0] === ''.
    expect(greetingName('  Jo  Ann  ')).toBe('Jo')
    expect(greetingName(' Prince')).toBe('Prince')
  })

  it('falls back rather than greeting nobody', () => {
    expect(greetingName('')).toBe('there')
    expect(greetingName('   ')).toBe('there')
  })

  it('leaves a one-word name alone', () => {
    expect(greetingName('Prince')).toBe('Prince')
    expect(greetingName('malikfarhanjamal314623')).toBe('malikfarhanjamal314623')
  })
})

describe('avatar initials are letters, and always two when there are two', () => {
  it('takes one letter from each of two words', () => {
    expect(initialsFor('Farhan Jamal')).toBe('FJ')
    expect(initialsFor('Salman R.')).toBe('SR')
  })

  it('takes two letters from a single word', () => {
    // Otherwise a provisioned account's one-word label gives a single
    // character and the avatar is a different shape from everyone else's.
    expect(initialsFor('Prince')).toBe('PR')
    expect(initialsFor('malikfarhanjamal314623')).toBe('MA')
  })

  it('never puts punctuation in the avatar', () => {
    // The defect: "O'Brien".slice(0, 2) === "O'".
    expect(initialsFor("O'Brien")).toBe('OB')
    expect(initialsFor('Mary-Jane')).toBe('MA')
    expect(initialsFor("Anne-Marie O'Neill")).toBe('AO')
  })

  it('keeps accented and non-Latin letters instead of blanking them', () => {
    // [A-Za-z] would have dropped every one of these and left an empty avatar.
    expect(initialsFor('Émile Zola')).toBe('ÉZ')
    expect(initialsFor('Ayşe Yılmaz')).toBe('AY')
    expect(initialsFor('李雷')).toBe('李雷')
  })

  it('falls back to the email when there is no usable name', () => {
    expect(initialsFor('', 'farhan@example.com')).toBe('FA')
    expect(initialsFor('123', 'farhan@example.com')).toBe('FA')
  })

  it('returns at most two characters, whatever it is given', () => {
    for (const name of ['Farhan Jamal Khan Malik', 'A B C D', 'Prince', '', '   ']) {
      expect(initialsFor(name, 'x@y.z').length, name).toBeLessThanOrEqual(2)
    }
  })
})
