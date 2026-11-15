import { describe, expect, it } from 'vitest'
import {
  isPluginFrameOriginUrl,
  parsePluginFrameUrl,
  pluginFrameKey,
  pluginFramePartition,
  readPluginFramePartitionKey
} from './plugin-frame-guest'

const KEY = pluginFrameKey('acme.charts')

describe('plugin frame guest identity', () => {
  it('round-trips the partition and refuses look-alikes', () => {
    expect(pluginFramePartition(KEY)).toBe(`persist:dolphin-plugin-${KEY}`)
    expect(readPluginFramePartitionKey(pluginFramePartition(KEY))).toBe(KEY)
    expect(readPluginFramePartitionKey(`persist:dolphin-plugin-${KEY}x`)).toBeNull()
    expect(readPluginFramePartitionKey(`dolphin-plugin-${KEY}`)).toBeNull()
    expect(readPluginFramePartitionKey('persist:dolphin-plugin-../../x')).toBeNull()
  })
})

describe('plugin frame URLs', () => {
  it('parses contained paths into decoded segments', () => {
    expect(parsePluginFrameUrl(`dolphin-plugin-frame://${KEY}/ui/app.js?v=1`)).toEqual({
      frameKey: KEY,
      segments: ['ui', 'app.js'],
      reserved: false
    })
    expect(parsePluginFrameUrl(`dolphin-plugin-frame://${KEY}/a%20b/x.wasm`)?.segments).toEqual([
      'a b',
      'x.wasm'
    ])
    expect(parsePluginFrameUrl(`dolphin-plugin-frame://${KEY}/__dolphin/sdk.js`)?.reserved).toBe(true)
    expect(parsePluginFrameUrl(`dolphin-plugin-frame://${KEY}/__DOLPHIN/sdk.js`)?.reserved).toBe(true)
    expect(parsePluginFrameUrl(`dolphin-plugin-frame://${KEY}/__Dolphin/sdk.js`)?.reserved).toBe(true)
  })

  it.each([
    `dolphin-plugin-frame://${KEY}/`,
    `dolphin-plugin-frame://${KEY}/..%2Fsecret`,
    `dolphin-plugin-frame://${KEY}/a%5C..%5Cb`,
    `dolphin-plugin-frame://${KEY}/a%00b`,
    `dolphin-plugin-frame://${KEY}/__dolphin./runtime.mjs`,
    `dolphin-plugin-frame://${KEY}/__dolphin%20/runtime.mjs`,
    `dolphin-plugin-frame://${KEY}/panel.html.`,
    `dolphin-plugin-frame://${KEY}/C:%5Cwindows`,
    `dolphin-plugin-frame://${KEY}/bad%E0%A4%A`,
    `dolphin-plugin-frame://${KEY}:8080/x`,
    `dolphin-plugin-frame://user@${KEY}/x`,
    'dolphin-plugin-frame://NOTAKEY/x',
    `https://${KEY}/x`
  ])('refuses %s', (url) => {
    expect(parsePluginFrameUrl(url)).toBeNull()
  })

  it('matches only the exact plugin origin', () => {
    expect(isPluginFrameOriginUrl(`dolphin-plugin-frame://${KEY}/x.html`, KEY)).toBe(true)
    expect(isPluginFrameOriginUrl(`dolphin-plugin-frame://${pluginFrameKey('a.b')}/x`, KEY)).toBe(
      false
    )
    expect(isPluginFrameOriginUrl(`blob:dolphin-plugin-frame://${KEY}/uuid`, KEY)).toBe(false)
    expect(isPluginFrameOriginUrl('not a url', KEY)).toBe(false)
  })
})
