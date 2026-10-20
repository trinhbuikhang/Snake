import { describe, it, expect } from 'vitest'
import { isTypingTarget } from './keyboard.js'

describe('isTypingTarget()', () => {
  it('is false for missing targets', () => {
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(undefined)).toBe(false)
    expect(isTypingTarget({})).toBe(false)
  })

  it('is true for form fields', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true)
  })

  it('is true for contenteditable elements', () => {
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('is false for game surfaces and plain elements', () => {
    expect(isTypingTarget({ tagName: 'CANVAS' })).toBe(false)
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false)
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false)
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
  })
})
