import { describe, expect, test } from 'vitest'
import { parsePrefixInvocation, toBoolean, toChannelId, toInteger, toNumber, toRoleId, toUserId } from './prefix.ts'

const ID = '123456789012345678'

describe('parsePrefixInvocation', () => {
    test('半角と全角のプレフィックスを受け付ける', () => {
        expect(parsePrefixInvocation('%ping')).toEqual({ name: 'ping', tokens: [] })
        expect(parsePrefixInvocation('％p')).toEqual({ name: 'p', tokens: [] })
    })

    test('連続した空白（全角を含む）で区切る', () => {
        expect(parsePrefixInvocation('%ping a  b　c\n')).toEqual({ name: 'ping', tokens: ['a', 'b', 'c'] })
    })

    test('プレフィックスの直後に名前がなければ対象外', () => {
        expect(parsePrefixInvocation('% ping')).toBeUndefined()
        expect(parsePrefixInvocation('%')).toBeUndefined()
        expect(parsePrefixInvocation('ping')).toBeUndefined()
        expect(parsePrefixInvocation('100%')).toBeUndefined()
    })
})

describe('型変換', () => {
    test('整数', () => {
        expect(toInteger('21')).toBe(21)
        expect(toInteger('-3')).toBe(-3)
        expect(toInteger('1.5')).toBeUndefined()
        expect(toInteger('abc')).toBeUndefined()
    })

    test('数値', () => {
        expect(toNumber('1.5')).toBe(1.5)
        expect(toNumber('abc')).toBeUndefined()
        expect(toNumber('Infinity')).toBeUndefined()
    })

    test('真偽値', () => {
        expect(toBoolean('ON')).toBe(true)
        expect(toBoolean('no')).toBe(false)
        expect(toBoolean('maybe')).toBeUndefined()
    })

    test('メンションと ID', () => {
        expect(toUserId(`<@${ID}>`)).toBe(ID)
        expect(toUserId(`<@!${ID}>`)).toBe(ID)
        expect(toUserId(ID)).toBe(ID)
        expect(toUserId(`<#${ID}>`)).toBeUndefined()
        expect(toChannelId(`<#${ID}>`)).toBe(ID)
        expect(toRoleId(`<@&${ID}>`)).toBe(ID)
        expect(toRoleId(`<@${ID}>`)).toBeUndefined()
        expect(toUserId('123')).toBeUndefined()
    })
})
